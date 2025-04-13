import logging
from datetime import datetime, timedelta

from fastapi import Depends, status, Request, Response, Form, APIRouter
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from starlette.responses import HTMLResponse

from app.api.dependencies import get_current_active_user, get_current_admin_user
from app.core.config import settings
from app.core.db import get_db
from app.core.security import ALGORITHM
from app.core.security import create_access_token, verify_password
from app.models.user import User

# Initialize templates
templates = Jinja2Templates(directory="app/templates")
router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


# Add this helper function at the top of your auth.py file
def create_authenticated_response(url: str, token: str, status_code: int = status.HTTP_303_SEE_OTHER):
    """Create a redirect response that preserves authentication"""
    response = RedirectResponse(url=url, status_code=status_code)
    if token:
        # Strip "Bearer " prefix if present
        if token.startswith("Bearer "):
            token = token.replace("Bearer ", "")

        # Set cookie with token
        response.set_cookie(
            key="access_token",
            value=f"Bearer {token}",
            httponly=True,
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            path="/",
            samesite="lax",
            secure=False  # Change to True in production with HTTPS
        )
    return response


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """Render login page"""
    return templates.TemplateResponse("login.html", {"request": request})


@router.post("/login")
async def login(
        response: Response,
        username: str = Form(...),
        password: str = Form(...),
        db: AsyncSession = Depends(get_db)
):
    """Authenticate and generate token"""
    try:
        # Find the user in the database
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalars().first()

        # Validate user and password
        if not user or not verify_password(password, user.hashed_password):
            return RedirectResponse(
                url="/auth/login?error=Invalid+username+or+password",
                status_code=status.HTTP_303_SEE_OTHER
            )

        # Update last login timestamp
        user.last_login = datetime.utcnow()
        db.add(user)
        await db.commit()

        # Generate JWT token
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            subject=user.username, expires_delta=access_token_expires
        )

        # Set cookie with token
        response = RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)
        response.set_cookie(
            key="access_token",
            value=f"Bearer {access_token}",
            httponly=True,
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            expires=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            samesite="lax",
            secure=False  # Change to True in production with HTTPS
        )

        return response
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        return RedirectResponse(
            url="/auth/login?error=System+error",
            status_code=status.HTTP_303_SEE_OTHER
        )


@router.get("/logout")
async def logout():
    """Log out the user"""
    response = RedirectResponse(url="/auth/login", status_code=status.HTTP_303_SEE_OTHER)
    response.delete_cookie(key="access_token")
    return response


@router.get("/admin")
async def admin_dashboard(
        request: Request,
        db: AsyncSession = Depends(get_db)
):
    """Admin dashboard for user management"""
    # Get token from cookie
    token = request.cookies.get("access_token")
    if token and token.startswith("Bearer "):
        token = token.replace("Bearer ", "")

    if not token:
        return RedirectResponse(
            url="/auth/login?error=Not+authenticated",
            status_code=status.HTTP_303_SEE_OTHER
        )

    # Verify token and get user
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            return RedirectResponse(
                url="/auth/login?error=Invalid+token",
                status_code=status.HTTP_303_SEE_OTHER
            )

        # Get the user from database
        result = await db.execute(select(User).where(User.username == username))
        current_user = result.scalars().first()

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
        result = await db.execute(select(User).order_by(User.username))
        users = result.scalars().all()

        return templates.TemplateResponse(
            "admin.html",
            {"request": request, "current_user": current_user, "users": users}
        )

    except JWTError:
        return RedirectResponse(
            url="/auth/login?error=Invalid+token",
            status_code=status.HTTP_303_SEE_OTHER
        )


@router.post("/create-user")
async def create_user(
        request: Request,
        username: str = Form(...),
        password: str = Form(...),
        email: str = Form(None),
        full_name: str = Form(None),
        is_admin: bool = Form(False),
        db: AsyncSession = Depends(get_db)
):
    """Create a new user (admin only)"""
    # Get authentication token from cookie
    token = request.cookies.get("access_token")

    try:
        # Verify the token and check if user is admin
        if not token:
            return RedirectResponse(
                url="/auth/login?error=Session+expired",
                status_code=status.HTTP_303_SEE_OTHER
            )

        payload = jwt.decode(
            token.replace("Bearer ", "") if token.startswith("Bearer ") else token,
            settings.SECRET_KEY,
            algorithms=[ALGORITHM]
        )
        username_from_token = payload.get("sub")

        # Get current user from database
        result = await db.execute(select(User).where(User.username == username_from_token))
        current_user = result.scalars().first()

        if not current_user or not current_user.is_admin:
            return RedirectResponse(
                url="/auth/login?error=Not+authorized",
                status_code=status.HTTP_303_SEE_OTHER
            )

        # Check if username already exists
        result = await db.execute(select(User).where(User.username == username))
        existing_user = result.scalars().first()
        if existing_user:
            return create_authenticated_response(
                "/auth/admin?error=Username+already+exists",
                token
            )

        # Create new user
        hashed_password = User.get_password_hash(password)
        new_user = User(
            username=username,
            hashed_password=hashed_password,
            email=email,
            full_name=full_name,
            is_admin=is_admin == True  # Convert to bool in case it comes as string "true"
        )

        db.add(new_user)
        await db.commit()

        return create_authenticated_response(
            "/auth/admin?success=User+created+successfully",
            token
        )

    except Exception as e:
        logger.error(f"Create user error: {str(e)}")
        return create_authenticated_response(
            f"/auth/admin?error=System+error:{str(e)}",
            token
        )


@router.post("/delete-user/{user_id}")
async def delete_user(
        user_id: int,
        request: Request,
        db: AsyncSession = Depends(get_db)
):
    """Delete a user (admin only)"""
    # Get authentication token from cookie
    token = request.cookies.get("access_token")
    if token and token.startswith("Bearer "):
        token = token.replace("Bearer ", "")

    if not token:
        return RedirectResponse(
            url="/auth/login?error=Session+expired",
            status_code=status.HTTP_303_SEE_OTHER
        )

    try:
        # Verify the token and check if user is admin
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        username_from_token = payload.get("sub")

        # Get current user from database
        result = await db.execute(select(User).where(User.username == username_from_token))
        current_user = result.scalars().first()

        if not current_user or not current_user.is_admin:
            return RedirectResponse(
                url="/auth/login?error=Not+authorized",
                status_code=status.HTTP_303_SEE_OTHER
            )

        # Prevent admin from deleting themselves
        if current_user.id == user_id:
            response = RedirectResponse(
                url="/auth/admin?error=Cannot+delete+your+own+account",
                status_code=status.HTTP_303_SEE_OTHER
            )
            # Preserve the authentication token
            response.set_cookie(
                key="access_token",
                value=f"Bearer {token}",
                httponly=True,
                max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                path="/",
                samesite="lax",
                secure=False
            )
            return response

        # Find and delete the user
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()

        if not user:
            response = RedirectResponse(
                url="/auth/admin?error=User+not+found",
                status_code=status.HTTP_303_SEE_OTHER
            )
            # Preserve the authentication token
            response.set_cookie(
                key="access_token",
                value=f"Bearer {token}",
                httponly=True,
                max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                path="/",
                samesite="lax",
                secure=False
            )
            return response

        await db.delete(user)
        await db.commit()

        # Create response with preserved authentication
        response = RedirectResponse(
            url="/auth/admin?success=User+deleted+successfully",
            status_code=status.HTTP_303_SEE_OTHER
        )
        # Preserve the authentication token
        response.set_cookie(
            key="access_token",
            value=f"Bearer {token}",
            httponly=True,
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            path="/",
            samesite="lax",
            secure=False
        )
        return response

    except Exception as e:
        logger.error(f"Delete user error: {str(e)}")
        # Create response with preserved authentication even on error
        response = RedirectResponse(
            url="/auth/admin?error=System+error:+{str(e)}",
            status_code=status.HTTP_303_SEE_OTHER
        )
        # Preserve the authentication token
        if token:
            response.set_cookie(
                key="access_token",
                value=f"Bearer {token}",
                httponly=True,
                max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                path="/",
                samesite="lax",
                secure=False
            )
        return response


@router.get("/check-admin", response_model=dict)
async def check_admin(current_user: User = Depends(get_current_active_user)):
    """Check if current user is an admin"""
    return {"is_admin": current_user.is_admin}
