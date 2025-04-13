# app/core/security.py
from datetime import datetime, timedelta
from typing import Optional, Union, Any, Dict
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Request, HTTPException, status
import re
import secrets  # Import the secrets module properly

from app.core.config import settings

# Create a more robust password context with better settings
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12  # Increase work factor for better security
)

ALGORITHM = "HS256"

# Define password policy regex
PASSWORD_MIN_LENGTH = 8
PASSWORD_PATTERN = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{" + str(PASSWORD_MIN_LENGTH) + ",}$")


def validate_password(password: str) -> bool:
    """
    Validate a password against security policy:
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character
    """
    return bool(PASSWORD_PATTERN.match(password))


def get_password_validation_message() -> str:
    """Return a human-readable password policy message"""
    return (
        f"Password must be at least {PASSWORD_MIN_LENGTH} characters long and contain "
        "at least one uppercase letter, one lowercase letter, one digit, and one special character."
    )


def create_access_token(
        subject: Union[str, Any],
        expires_delta: Optional[timedelta] = None,
        fresh: bool = False,
        scopes: list = None
) -> str:
    """
    Create a JWT access token with enhanced claims

    Args:
        subject: The subject of the token (typically username)
        expires_delta: Optional expiration override
        fresh: Whether this is a fresh token (useful for sensitive operations)
        scopes: Optional list of permission scopes

    Returns:
        Encoded JWT token string
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    # Build token claims
    to_encode = {
        "exp": expire,
        "iat": datetime.utcnow(),
        "sub": str(subject),
        "jti": secrets.token_urlsafe(16),  # Unique token ID
    }

    # Add optional claims
    if fresh:
        to_encode["fresh"] = True

    if scopes:
        to_encode["scopes"] = scopes

    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(
        subject: Union[str, Any],
        expires_delta: Optional[timedelta] = None
) -> str:
    """Create a refresh token with longer expiration"""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=30)  # 30 days by default

    to_encode = {
        "exp": expire,
        "iat": datetime.utcnow(),
        "sub": str(subject),
        "jti": secrets.token_urlsafe(16),
        "type": "refresh"
    }

    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Generate password hash"""
    return pwd_context.hash(password)


def create_csrf_token() -> str:
    """Generate a secure CSRF token"""
    return secrets.token_urlsafe(32)


async def verify_token(token: str) -> Dict:
    """
    Verify JWT token and return payload

    Args:
        token: JWT token string

    Returns:
        Token payload dictionary if valid

    Raises:
        HTTPException: If token is invalid
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def extract_token_from_request(request: Request) -> Optional[str]:
    """Extract JWT token from either cookie or authorization header"""
    # Try cookie first
    token = request.cookies.get("access_token")

    # If not in cookie, try auth header
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.replace("Bearer ", "")

    # Normalize token (strip Bearer prefix if present)
    if token and token.startswith("Bearer "):
        token = token.replace("Bearer ", "")

    return token


async def verify_csrf_token(request: Request) -> bool:
    """
    Verify CSRF token in request against session

    Returns False if tokens don't match or token is missing
    """
    # Get tokens from cookie and request form/header
    cookie_token = request.cookies.get("csrf_token")

    # Try to get from form data
    form_token = None
    if hasattr(request, "form"):
        form_token = await request.form().get("csrf_token")

    # If not in form, try header
    if not form_token:
        form_token = request.headers.get("X-CSRF-Token")

    # Verify both tokens exist and match
    if not cookie_token or not form_token:
        return False

    return cookie_token == form_token
