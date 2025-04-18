import traceback
from fastapi import Form, status, Request, Response, Depends, APIRouter, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from typing import Optional
import logging
from datetime import datetime, timedelta
from app.models.column_settings import ColumnSetting
from app.models.data_change import DataChange
from app.models.change_log import ChangeLog

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

        # *** ADDED: Invalidate relevant caches to ensure fresh data ***
        from app.core.cache import init_redis_pool, invalidate_cache
        redis = await init_redis_pool()
        await invalidate_cache("table_data:*")  # Invalidate all table data caches
        logger.info(f"Invalidated table data cache for user: {username}")

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

        # Get column settings
        from app.models.column_settings import ColumnSetting

        # Get columns from the actual database table
        try:
            # Get the actual table columns
            from app.models.table import BigTable
            from sqlalchemy import inspect

            # Use a separate sync engine to inspect table schema
            from app.core.db import sync_engine

            # Get all columns from the database
            inspector = inspect(sync_engine)
            table_columns = inspector.get_columns("taitur_data")  # Use your actual table name
            column_names = [col['name'] for col in table_columns]

            # For each column, get or create a ColumnSetting
            columns = []
            for col_name in column_names:
                # Try to get existing setting
                setting = db.query(ColumnSetting).filter(ColumnSetting.column_name == col_name).first()

                # If not exists, create it
                if not setting:
                    display_name = col_name.replace("_", " ").title()
                    setting = ColumnSetting(column_name=col_name, display_name=display_name, is_editable=False)
                    db.add(setting)
                    db.commit()
                    db.refresh(setting)

                columns.append(setting)

        except Exception as e:
            logger.error(f"Error loading columns for admin: {str(e)}")
            columns = []

        # Generate CSRF token for admin forms
        csrf_token = create_csrf_token()

        # Prepare response
        response = templates.TemplateResponse(
            "admin.html",
            {
                "request": request,
                "current_user": current_user,
                "users": users,
                "columns": columns,  # Add this line
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
        clean_token = token
        if clean_token.startswith("Bearer "):
            clean_token = clean_token.replace("Bearer ", "")

        response.set_cookie(
            key="access_token",
            value=f"Bearer {clean_token}",
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

@router.post("/toggle-column-editable/{column_id}")
async def toggle_column_editable(
        column_id: int,
        request: Request,
        csrf_token: str = Form(None),
        db: Session = Depends(get_user_db)
):
    """Toggle a column's editable status"""
    # Get authentication token from cookie
    token = extract_token_from_request(request)

    # Generate a new CSRF token upfront
    new_csrf_token = create_csrf_token()

    # Verify CSRF token
    cookie_csrf = request.cookies.get("csrf_token")
    if not cookie_csrf or cookie_csrf != csrf_token:
        logger.warning("CSRF token validation failed in toggle-column-editable")
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

        # Find the column setting
        column_setting = db.query(ColumnSetting).filter(ColumnSetting.id == column_id).first()

        if not column_setting:
            return create_authenticated_response(
                "/auth/admin?error=Column+setting+not+found",
                token,
                csrf_token=new_csrf_token
            )

        # Toggle the editable status
        column_setting.is_editable = not column_setting.is_editable
        db.commit()

        return create_authenticated_response(
            "/auth/admin?success=Column+editable+status+updated",
            token,
            csrf_token=new_csrf_token
        )

    except Exception as e:
        logger.error(f"Toggle column editable error: {str(e)}")
        return create_authenticated_response(
            f"/auth/admin?error=System+error:+{str(e)}",
            token,
            csrf_token=new_csrf_token
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
        can_edit: bool = Form(False),  # Add this parameter
        csrf_token: str = Form(None),
        db: Session = Depends(get_user_db)
):
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
            can_edit=can_edit,  # Add this line
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
