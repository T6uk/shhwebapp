# app/api/v1/endpoints/auth.py
import logging
from datetime import datetime, timedelta

from fastapi import (
    Depends, status, Request, Response, Form, APIRouter,
    HTTPException, Cookie, BackgroundTasks
)
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from sqlalchemy.future import select
from starlette.responses import HTMLResponse
from typing import Optional, Dict, Any

from app.api.dependencies import get_current_active_user, get_current_admin_user
from app.core.config import settings
from app.core.user_db import get_user_db
from app.core.security import (
    ALGORITHM, create_access_token, create_refresh_token, verify_password,
    get_password_hash, create_csrf_token, verify_token, extract_token_from_request,
    validate_password, get_password_validation_message
)
from app.models.user import User

# Initialize templates
templates = Jinja2Templates(directory="app/templates")
router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


# Helper functions
def create_authenticated_response(
        url: str,
        access_token: str,
        refresh_token: Optional[str] = None,
        csrf_token: Optional[str] = None,
        status_code: int = status.HTTP_303_SEE_OTHER,
        remember_me: bool = False
):
    """Create a redirect response with authentication cookies"""
    response = RedirectResponse(url=url, status_code=status_code)

    # Remove "Bearer " prefix if present in the token
    if access_token and access_token.startswith("Bearer "):
        access_token = access_token.replace("Bearer ", "")

    # Set access token cookie
    max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    if remember_me:
        max_age = 30 * 24 * 60 * 60  # 30 days

    response.set_cookie(
        key="access_token",
        value=f"Bearer {access_token}",
        httponly=True,
        max_age=max_age,
        path="/",
        samesite="lax",
        secure=settings.COOKIE_SECURE  # True in production
    )

    # Set refresh token if provided
    if refresh_token:
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            max_age=30 * 24 * 60 * 60,  # 30 days
            path="/auth/refresh",  # Restrict to refresh endpoint
            samesite="lax",
            secure=settings.COOKIE_SECURE
        )

    # Set CSRF token if provided
    if csrf_token:
        response.set_cookie(
            key="csrf_token",
            value=csrf_token,
            max_age=max_age,
            path="/",
            samesite="lax",
            secure=settings.COOKIE_SECURE,
            httponly=False  # Needs to be accessible to JavaScript
        )

    return response


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """Render login page with CSRF protection"""
    # Generate CSRF token
    csrf_token = create_csrf_token()

    # Render template
    response = templates.TemplateResponse(
        "login.html",
        {"request": request, "csrf_token": csrf_token}
    )

    # Set CSRF cookie
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        max_age=3600,  # 1 hour
        path="/",
        samesite="lax",
        secure=settings.COOKIE_SECURE,
        httponly=False
    )

    return response


@router.post("/login")
async def login(
        response: Response,
        username: str = Form(...),
        password: str = Form(...),
        remember_me: bool = Form(False),
        csrf_token: str = Form(None),
        db: Session = Depends(get_user_db),
        request: Request = None
):
    """Authenticate and generate tokens"""
    # Verify CSRF token
    cookie_csrf = request.cookies.get("csrf_token")
    if not cookie_csrf or cookie_csrf != csrf_token:
        return RedirectResponse(
            url="/auth/login?error=Invalid+request+signature",
            status_code=status.HTTP_303_SEE_OTHER
        )

    try:
        # Find the user
        user = db.query(User).filter(User.username == username).first()

        if not user:
            return RedirectResponse(
                url="/auth/login?error=Invalid+username+or+password",
                status_code=status.HTTP_303_SEE_OTHER
            )

        # Check if account is locked
        if user.is_locked:
            return RedirectResponse(
                url=f"/auth/login?error=Account+locked.+Try+again+after+{user.locked_until.strftime('%H:%M:%S')}",
                status_code=status.HTTP_303_SEE_OTHER
            )

        # Verify password
        if not verify_password(password, user.hashed_password):
            # Increment failed attempts
            user.increment_failed_login()
            db.commit()
            return RedirectResponse(
                url="/auth/login?error=Invalid+username+or+password",
                status_code=status.HTTP_303_SEE_OTHER
            )

        # Reset failed attempts on successful login
        user.reset_failed_login()
        user.last_login = datetime.utcnow()
        db.commit()

        # Generate tokens
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            subject=user.username,
            expires_delta=access_token_expires,
            fresh=True
        )

        # Generate refresh token for remember me
        refresh_token = None
        if remember_me:
            refresh_token = create_refresh_token(subject=user.username)

        # Generate new CSRF token
        new_csrf_token = create_csrf_token()

        # Create response with tokens
        return create_authenticated_response(
            url="/",
            access_token=access_token,
            refresh_token=refresh_token,
            csrf_token=new_csrf_token,
            remember_me=remember_me
        )

    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        return RedirectResponse(
            url="/auth/login?error=System+error",
            status_code=status.HTTP_303_SEE_OTHER
        )


@router.get("/logout")
async def logout():
    """Log out the user by clearing all auth cookies"""
    response = RedirectResponse(url="/auth/login", status_code=status.HTTP_303_SEE_OTHER)

    # Clear all auth cookies
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/auth/refresh")
    response.delete_cookie(key="csrf_token", path="/")

    return response


@router.get("/check-admin", response_model=dict)
async def check_admin(current_user: User = Depends(get_current_active_user)):
    """Check if current user is an admin"""
    return {"is_admin": current_user.is_admin}


@router.get("/admin")
async def admin_dashboard(
        request: Request,
        db: Session = Depends(get_user_db)
):
    """Admin dashboard for user management with enhanced security"""
    # Get token from cookie
    token = extract_token_from_request(request)

    if not token:
        return RedirectResponse(
            url="/auth/login?error=Not+authenticated",
            status_code=status.HTTP_303_SEE_OTHER
        )

    # Verify token and get user
    try:
        payload = await verify_token(token)
        username = payload.get("sub")

        # Get the user from database
        current_user = db.query(User).filter(User.username == username).first()

        if not current_user:
            return RedirectResponse(
                url="/auth/login?error=User+not+found",
                status_code=status.HTTP_303_SEE_OTHER
            )

        if not current_user.is_admin:
            return RedirectResponse(
                url="/?error=Not+authorized",
                status_code=status.HTTP_303_SEE_OTHER
            )

        # Get all users for the admin panel
        users = db.query(User).order_by(User.username).all()

        # Generate CSRF token for admin forms
        csrf_token = create_csrf_token()

        # Prepare response
        response = templates.TemplateResponse(
            "admin.html",
            {
                "request": request,
                "current_user": current_user,
                "users": users,
                "csrf_token": csrf_token
            }
        )

        # Set CSRF cookie
        response.set_cookie(
            key="csrf_token",
            value=csrf_token,
            max_age=3600,  # 1 hour
            path="/",
            samesite="lax",
            secure=settings.COOKIE_SECURE,
            httponly=False
        )

        return response

    except HTTPException:
        return RedirectResponse(
            url="/auth/login?error=Invalid+token",
            status_code=status.HTTP_303_SEE_OTHER
        )
    except Exception as e:
        logger.error(f"Admin dashboard error: {str(e)}")
        return RedirectResponse(
            url="/auth/login?error=System+error",
            status_code=status.HTTP_303_SEE_OTHER
        )


# Now let's update the create_user function to properly preserve auth on errors
# Now let's update the create_user function to properly preserve auth on errors
@router.post("/create-user")
async def create_user(
        request: Request,
        username: str = Form(...),
        password: str = Form(...),
        email: str = Form(None),
        full_name: str = Form(None),
        is_admin: bool = Form(False),
        csrf_token: str = Form(None),
        db: Session = Depends(get_user_db)
):
    """Create a new user with enhanced security"""
    # Get authentication token from cookie
    token = extract_token_from_request(request)

    # Generate a new CSRF token upfront
    new_csrf_token = create_csrf_token()

    # Verify CSRF token
    cookie_csrf = request.cookies.get("csrf_token")
    if not cookie_csrf or cookie_csrf != csrf_token:
        # Create response that preserves authentication
        return create_authenticated_response(
            "/auth/admin?error=Invalid+request+signature",
            token,
            csrf_token=new_csrf_token
        )

    try:
        # Verify the token and check if user is admin
        if not token:
            return RedirectResponse(
                url="/auth/login?error=Session+expired",
                status_code=status.HTTP_303_SEE_OTHER
            )

        payload = await verify_token(token)
        username_from_token = payload.get("sub")

        # Get current user from database
        current_user = db.query(User).filter(User.username == username_from_token).first()

        if not current_user or not current_user.is_admin:
            return RedirectResponse(
                url="/auth/login?error=Not+authorized",
                status_code=status.HTTP_303_SEE_OTHER
            )

        # Check if username already exists
        existing_user = db.query(User).filter(User.username == username).first()
        if existing_user:
            return create_authenticated_response(
                "/auth/admin?error=Username+already+exists",
                token,
                csrf_token=new_csrf_token
            )

        # Validate password strength
        if not validate_password(password):
            return create_authenticated_response(
                f"/auth/admin?error={get_password_validation_message().replace(' ', '+')}",
                token,
                csrf_token=new_csrf_token
            )

        # Create new user
        hashed_password = get_password_hash(password)
        new_user = User(
            username=username,
            hashed_password=hashed_password,
            email=email,
            full_name=full_name,
            is_admin=is_admin,
            password_last_changed=datetime.utcnow()
        )

        db.add(new_user)
        db.commit()

        # Create success response with preserved authentication
        return create_authenticated_response(
            "/auth/admin?success=User+created+successfully",
            token,
            csrf_token=new_csrf_token
        )

    except Exception as e:
        logger.error(f"Create user error: {str(e)}")
        # Ensure authentication is preserved even on error
        return create_authenticated_response(
            f"/auth/admin?error=System+error:{str(e)}",
            token,
            csrf_token=new_csrf_token
        )


@router.post("/delete-user/{user_id}")
async def delete_user(
        user_id: int,
        request: Request,
        csrf_token: str = Form(None),
        db: Session = Depends(get_user_db)
):
    """Delete a user with CSRF protection"""
    # Get authentication token from cookie
    token = extract_token_from_request(request)

    # Generate a new CSRF token upfront
    new_csrf_token = create_csrf_token()

    # Verify CSRF token
    cookie_csrf = request.cookies.get("csrf_token")
    if not cookie_csrf or cookie_csrf != csrf_token:
        return create_authenticated_response(
            "/auth/admin?error=Invalid+request+signature",
            token,
            csrf_token=new_csrf_token
        )

    if not token:
        return RedirectResponse(
            url="/auth/login?error=Session+expired",
            status_code=status.HTTP_303_SEE_OTHER
        )

    try:
        # Verify the token and check if user is admin
        payload = await verify_token(token)
        username_from_token = payload.get("sub")

        # Get current user from database
        current_user = db.query(User).filter(User.username == username_from_token).first()

        if not current_user or not current_user.is_admin:
            return RedirectResponse(
                url="/auth/login?error=Not+authorized",
                status_code=status.HTTP_303_SEE_OTHER
            )

        # Prevent admin from deleting themselves
        if current_user.id == user_id:
            return create_authenticated_response(
                "/auth/admin?error=Cannot+delete+your+own+account",
                token,
                csrf_token=new_csrf_token
            )

        # Find and delete the user
        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            return create_authenticated_response(
                "/auth/admin?error=User+not+found",
                token,
                csrf_token=new_csrf_token
            )

        db.delete(user)
        db.commit()

        return create_authenticated_response(
            "/auth/admin?success=User+deleted+successfully",
            token,
            csrf_token=new_csrf_token
        )

    except Exception as e:
        logger.error(f"Delete user error: {str(e)}")
        return create_authenticated_response(
            f"/auth/admin?error=System+error:+{str(e)}",
            token,
            csrf_token=new_csrf_token
        )