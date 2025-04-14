# app/api/dependencies.py
from fastapi import Depends, HTTPException, status, Request, Cookie
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from typing import Optional, Union

from app.core.config import settings
from app.core.user_db import get_user_db
from app.core.security import ALGORITHM, extract_token_from_request, verify_token
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


async def get_token_from_request(
        request: Request,
        token: Optional[str] = Depends(oauth2_scheme)
) -> str:
    """Extract token from request in various formats"""
    # If token from OAuth2 scheme is None, try to get from cookie or header
    if not token:
        token = extract_token_from_request(request)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return token


async def get_current_user(
        token: str = Depends(get_token_from_request),
        db: Session = Depends(get_user_db)
) -> User:
    """Get current user from token"""
    try:
        # Verify token
        payload = await verify_token(token)
        username: str = payload.get("sub")

        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user from database
    user = db.query(User).filter(User.username == username).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_active_user(
        current_user: User = Depends(get_current_user),
) -> User:
    """Check if user is active"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    # Check if account is locked
    if current_user.is_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is locked due to too many failed login attempts"
        )

    return current_user


async def get_current_admin_user(
        current_user: User = Depends(get_current_active_user),
) -> User:
    """Check if user is an admin"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    return current_user


async def get_csrf_protected(
        request: Request,
        csrf_token_cookie: Optional[str] = Cookie(None, alias="csrf_token")
) -> None:
    """Verify CSRF protection for POST/PUT/DELETE requests"""
    # Only check CSRF on state-changing methods
    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        # Get CSRF token from form or header
        form_token = None
        if hasattr(request, "form"):
            form_data = await request.form()
            form_token = form_data.get("csrf_token")

        if not form_token:
            form_token = request.headers.get("X-CSRF-Token")

        # Verify tokens
        if not csrf_token_cookie or not form_token or csrf_token_cookie != form_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token validation failed"
            )