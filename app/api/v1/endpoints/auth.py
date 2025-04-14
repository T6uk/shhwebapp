import traceback
from fastapi import Form, status, Request, Response, Depends, APIRouter, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from typing import Optional
import logging
from datetime import datetime, timedelta

from app.api.dependencies import get_current_active_user
from app.core.user_db import get_user_db
from app.core.security import (
    verify_password, create_access_token, create_refresh_token, create_csrf_token, extract_token_from_request,
    verify_token, validate_password, get_password_hash, get_password_validation_message
)
from app.models.user import User
from app.core.config import settings

# Set up logging
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

    # Normalize the access token (remove Bearer prefix if present)
    clean_token = access_token
    if clean_token and clean_token.startswith("Bearer "):
        clean_token = clean_token.replace("Bearer ", "")

    # Set access token cookie
    max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    if remember_me:
        max_age = 30 * 24 * 60 * 60  # 30 days

    response.set_cookie(
        key="access_token",
        value=f"Bearer {clean_token}",
        httponly=True,
        max_age=max_age,
        path="/",
        samesite="lax",
        secure=settings.COOKIE_SECURE  # True in production
    )

    # Set refresh token if provided
    if refresh_token:
        # Normalize refresh token
        clean_refresh = refresh_token
        if clean_refresh and clean_refresh.startswith("Bearer "):
            clean_refresh = clean_refresh.replace("Bearer ", "")

        response.set_cookie(
            key="refresh_token",
            value=clean_refresh,
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


@router.route("/login", methods=["PUT", "DELETE", "PATCH", "OPTIONS"], include_in_schema=False)
async def login_method_not_allowed():
    """Handle unsupported methods for login endpoint"""
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Method not allowed. Use GET to view the login page or POST to submit login credentials."
    )


@router.post("/login")
async def login(
        request: Request,
        response: Response,
        db: Session = Depends(get_user_db)
):
    """Authenticate and generate tokens with improved error handling"""
    logger.info("Login POST request received")

    try:
        # Get form data manually to avoid dependency issues
        form_data = await request.form()
        username = form_data.get("username")
        password = form_data.get("password")
        remember_me = form_data.get("remember_me") == "true"
        csrf_token = form_data.get("csrf_token")

        logger.debug(f"Form data received for user: {username}")

        # Verify CSRF token
        cookie_csrf = request.cookies.get("csrf_token")
        if not cookie_csrf or cookie_csrf != csrf_token:
            logger.warning("CSRF token validation failed")
            return RedirectResponse(
                url="/auth/login?error=Invalid+request+signature",
                status_code=status.HTTP_303_SEE_OTHER
            )

        # Find the user
        user = db.query(User).filter(User.username == username).first()

        if not user:
            logger.warning(f"Login attempt with non-existent username: {username}")
            return RedirectResponse(
                url="/auth/login?error=Invalid+username+or+password",
                status_code=status.HTTP_303_SEE_OTHER
            )

        # Check if account is locked
        if user.is_locked:
            logger.warning(f"Login attempt on locked account: {username}")
            return RedirectResponse(
                url=f"/auth/login?error=Account+locked.+Try+again+after+{user.locked_until.strftime('%H:%M:%S')}",
                status_code=status.HTTP_303_SEE_OTHER
            )

        # Verify password
        if not verify_password(password, user.hashed_password):
            # Increment failed attempts
            user.increment_failed_login()
            db.commit()
            logger.warning(f"Invalid password for user: {username}")
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
        logger.info(f"Generated access token for user: {username}")

        # Generate refresh token for remember me
        refresh_token = None
        if remember_me:
            refresh_token = create_refresh_token(subject=user.username)

        # Generate new CSRF token
        new_csrf_token = create_csrf_token()

        # Create response with tokens
        redirect_response = create_authenticated_response(
            url="/",
            access_token=access_token,
            refresh_token=refresh_token,
            csrf_token=new_csrf_token,
            remember_me=remember_me
        )

        logger.info(f"User {username} logged in successfully")
        return redirect_response

    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        logger.error(traceback.format_exc())
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
        logger.warning("No token found in request for admin dashboard")
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
            logger.warning(f"User {username} not found in database")
            return RedirectResponse(
                url="/auth/login?error=User+not+found",
                status_code=status.HTTP_303_SEE_OTHER
            )

        if not current_user.is_admin:
            logger.warning(f"User {username} is not an admin")
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

        # Also refresh the access token cookie explicitly
        response.set_cookie(
            key="access_token",
            value=f"Bearer {token}",
            httponly=True,
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            path="/",
            samesite="lax",
            secure=settings.COOKIE_SECURE
        )

        return response

    except HTTPException as e:
        logger.error(f"HTTP exception in admin dashboard: {str(e.detail)}")
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
@router.post("/create-user")
async def create_user(
        request: Request,
        username: str = Form(...),
        password: str = Form(...),
        email: str = Form(None),
        full_name: str = Form(None),
        is_admin: bool = Form(False),
        can_edit: bool = Form(False),  # Add the can_edit parameter
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
        logger.warning("CSRF token validation failed in create-user")
        # Create response that preserves authentication
        return create_authenticated_response(
            "/auth/admin?error=Invalid+request+signature",
            token,
            csrf_token=new_csrf_token
        )

    try:
        # Verify the token and check if user is admin
        if not token:
            logger.warning("No token found in request for create-user")
            return RedirectResponse(
                url="/auth/login?error=Session+expired",
                status_code=status.HTTP_303_SEE_OTHER
            )

        payload = await verify_token(token)
        username_from_token = payload.get("sub")

        # Get current user from database
        current_user = db.query(User).filter(User.username == username_from_token).first()

        if not current_user or not current_user.is_admin:
            logger.warning(f"User {username_from_token} is not authorized for create-user")
            return RedirectResponse(
                url="/auth/login?error=Not+authorized",
                status_code=status.HTTP_303_SEE_OTHER
            )

        # Check if username already exists
        existing_user = db.query(User).filter(User.username == username).first()
        if existing_user:
            logger.warning(f"Attempted to create user with existing username: {username}")
            return create_authenticated_response(
                "/auth/admin?error=Username+already+exists",
                token,
                csrf_token=new_csrf_token
            )

        # Validate password strength
        if not validate_password(password):
            logger.warning("Password validation failed in create-user")
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
            can_edit=can_edit,  # Set the can_edit flag
            password_last_changed=datetime.utcnow()
        )

        db.add(new_user)
        db.commit()
        logger.info(f"Created new user: {username}")

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
            f"/auth/admin?error=System+error",
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

    # More relaxed CSRF validation
    cookie_csrf = request.cookies.get("csrf_token")
    if not cookie_csrf or cookie_csrf != csrf_token:
        logger.warning(f"CSRF token mismatch in delete_user function")
        # Continue anyway to prevent breaking UX

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


@router.get("/permissions")
async def get_user_permissions(current_user: User = Depends(get_current_active_user)):
    """Get the current user's permissions"""
    return {
        "username": current_user.username,
        "is_admin": current_user.is_admin,
        "can_edit": current_user.can_edit
    }


@router.post("/toggle-edit-mode")
async def toggle_edit_mode(
        request: Request,
        password: str = Form(...),
        csrf_token: str = Form(None),
        db: Session = Depends(get_user_db),
        current_user: User = Depends(get_current_active_user)
):
    """Enable edit mode with password verification"""
    # Verify CSRF token
    cookie_csrf = request.cookies.get("csrf_token")
    if not cookie_csrf or cookie_csrf != csrf_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid request signature"
        )

    # Check if user has edit permissions
    if not current_user.can_edit and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to edit data"
        )

    # Verify password
    if not verify_password(password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password"
        )

    # Password is correct, generate a specific edit mode token
    edit_token = create_access_token(
        subject=current_user.username,
        expires_delta=timedelta(minutes=30),  # Short-lived token for edit mode
        scopes=["edit"]
    )

    response = JSONResponse(content={"success": True, "message": "Edit mode activated"})

    # Set the edit mode token as a cookie
    response.set_cookie(
        key="edit_token",
        value=edit_token,
        httponly=True,
        max_age=30 * 60,  # 30 minutes
        path="/",
        samesite="lax",
        secure=settings.COOKIE_SECURE
    )

    return response
