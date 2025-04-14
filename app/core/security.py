# app/core/security.py
import logging
import re
import secrets  # Import the secrets module properly
import traceback
from datetime import datetime, timedelta
from typing import Optional, Union, Any, Dict

from fastapi import Request, HTTPException, status
from jose import jwt, JWTError
from passlib.context import CryptContext

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
    Create a JWT access token with enhanced claims and error handling
    """
    try:
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

        # Check if SECRET_KEY is properly set
        if not settings.SECRET_KEY:
            logger.error("SECRET_KEY is not configured properly!")
            raise ValueError("Missing SECRET_KEY")

        # Log token creation (never log the full token or SECRET_KEY)
        logger.debug(f"Creating JWT token for subject: {subject}")
        logger.debug(f"Token will expire at: {expire}")

        encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt

    except Exception as e:
        logger.error(f"Error creating access token: {str(e)}")
        raise


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


logger = logging.getLogger(__name__)

logger = logging.getLogger(__name__)


async def verify_token(token: str) -> Dict:
    """
    Verify JWT token and return payload with improved error handling
    """
    if not token:
        logger.error("Token is empty or None")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Normalize token (remove Bearer prefix if present)
    if token.startswith("Bearer "):
        token = token.replace("Bearer ", "")

    try:
        # Log first few characters of token for debugging (never log full tokens)
        token_preview = token[:10] + "..." if len(token) > 10 else "invalid_token"
        logger.debug(f"Verifying token: {token_preview}")

        # Decode and verify the token
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"verify_signature": True}
        )
        logger.debug(f"Token verified successfully for subject: {payload.get('sub')}")
        return payload

    except jwt.ExpiredSignatureError:
        logger.error("Token has expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    except jwt.JWTClaimsError as e:
        logger.error(f"JWT claims error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims",
            headers={"WWW-Authenticate": "Bearer"},
        )

    except JWTError as e:
        logger.error(f"JWT error: {str(e)}")
        logger.error(f"SECRET_KEY first few chars: {settings.SECRET_KEY[:5]}...")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature",
            headers={"WWW-Authenticate": "Bearer"},
        )

    except Exception as e:
        logger.error(f"Unexpected error verifying token: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication error",
            headers={"WWW-Authenticate": "Bearer"},
        )


def extract_token_from_request(request: Request) -> Optional[str]:
    """Extract JWT token from either cookie or authorization header with better logging"""
    # Try cookie first
    token = request.cookies.get("access_token")
    source = "cookie"

    # If not in cookie, try auth header
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.replace("Bearer ", "")
            source = "header"

    # Normalize token (strip Bearer prefix if present)
    if token and token.startswith("Bearer "):
        token = token.replace("Bearer ", "")

    # Log token extraction status
    if token:
        logger.debug(f"Token extracted from {source}, length: {len(token)}")
    else:
        logger.debug("No token found in request")

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


async def verify_edit_token(request: Request) -> dict:
    """
    Verify the edit mode token from cookie
    Returns the payload if valid, or raises HTTPException
    """
    edit_token = request.cookies.get("edit_token")

    if not edit_token:
        logger.warning("No edit token found in request")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Edit mode not activated. Please enter your password to enable editing."
        )

    try:
        # Decode and verify the token
        payload = jwt.decode(
            edit_token,
            settings.SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"verify_signature": True}
        )

        # Check for edit scope
        scopes = payload.get("scopes", [])
        if "edit" not in scopes:
            logger.warning("Token does not have edit scope")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Edit mode token is invalid. Please re-enter your password."
            )

        return payload

    except jwt.ExpiredSignatureError:
        logger.warning("Edit token has expired")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Edit mode session expired. Please re-enter your password."
        )

    except Exception as e:
        logger.error(f"Error verifying edit token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authentication error. Please log in again."
        )
