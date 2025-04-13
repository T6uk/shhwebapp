# app/main.py (partial, showing the updated startup section)
from fastapi import FastAPI, Request, Depends, Response, Cookie, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import os
import logging
from jose import jwt, JWTError
from typing import Optional
from datetime import datetime

from app.core.config import settings
from app.core.db import get_db, init_db
from app.core.user_db import init_user_db
from app.core.security import (
    ALGORITHM, get_password_hash, extract_token_from_request, verify_token
)
from app.core.cache import init_redis_pool
from app.api.v1.endpoints import table
from app.api.v1.endpoints.auth import router as auth_router

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Big Table App")

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files with appropriate caching headers
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Set up Jinja2 templates
templates = Jinja2Templates(directory="app/templates")

# Include API routers
app.include_router(table.router, prefix=settings.API_V1_STR)
app.include_router(auth_router)

# OAuth2 scheme for getting token from Authorization header or cookie
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)


# Authentication middleware
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # Public paths that don't require authentication
    public_paths = [
        "/auth/login",
        "/auth/refresh",
        "/auth/reset-password",
        "/static/",
        "/favicon.ico",
        "/sw.js",
        "/manifest.json"
    ]

    # Check if the path is public
    for path in public_paths:
        if request.url.path.startswith(path):
            return await call_next(request)

    # Pass the request to the next middleware without checking auth
    # We'll let the authentication be handled by the admin route directly
    if request.url.path == "/auth/admin":
        return await call_next(request)

    # Check for token
    token = extract_token_from_request(request)

    # If no token, redirect to login without error message
    if not token:
        logger.debug("No token found - redirecting to login page")
        return RedirectResponse(url="/auth/login", status_code=status.HTTP_303_SEE_OTHER)

    # Verify token
    try:
        # Normalize token (remove Bearer prefix if present)
        if token and token.startswith("Bearer "):
            token = token.replace("Bearer ", "")

        # Use the verify_token function from security.py
        payload = await verify_token(token)

        # Continue with the request
        response = await call_next(request)

        # Ensure token is preserved in the response if it's a redirect
        if isinstance(response, RedirectResponse) and "access_token" not in response.headers.get("set-cookie", ""):
            max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
            response.set_cookie(
                key="access_token",
                value=f"Bearer {token}",
                httponly=True,
                max_age=max_age,
                path="/",
                samesite="lax",
                secure=settings.COOKIE_SECURE
            )

        return response

    except HTTPException:
        # Token is invalid - clear it and redirect to login without error message
        # This happens on first app startup with old tokens
        logger.debug("Invalid token found - clearing and redirecting to login")
        response = RedirectResponse(url="/auth/login", status_code=status.HTTP_303_SEE_OTHER)

        # Clear the invalid token
        response.delete_cookie(key="access_token", path="/")
        response.delete_cookie(key="refresh_token", path="/auth/refresh")

        return response

    except Exception as e:
        # For unexpected errors, log them but don't show error to user on login page
        logger.error(f"Auth middleware error: {str(e)}")
        response = RedirectResponse(url="/auth/login", status_code=status.HTTP_303_SEE_OTHER)

        # Clear any problematic tokens
        response.delete_cookie(key="access_token", path="/")
        response.delete_cookie(key="refresh_token", path="/auth/refresh")

        return response


@app.get("/")
async def index(request: Request):
    """Render the main page with the data table"""
    # Get token from request
    token = extract_token_from_request(request)
    current_user = None

    if token:
        try:
            # Verify token and get username
            payload = await verify_token(token)
            username = payload.get("sub")

            # Get user from database
            from app.models.user import User
            from app.core.user_db import SessionLocal

            db = SessionLocal()
            try:
                current_user = db.query(User).filter(User.username == username).first()
            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error getting current user: {str(e)}")

    return templates.TemplateResponse(
        "index.html",
        {"request": request, "current_user": current_user}
    )


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Serve favicon"""
    return FileResponse("app/static/icons/favicon.ico")


@app.get("/sw.js", include_in_schema=False)
async def service_worker():
    """Serve service worker at root to ensure proper scope"""
    return FileResponse("app/static/sw.js")


@app.on_event("startup")
async def startup_event():
    """Initialize database and Redis connections on startup"""
    # Log critical configuration values (but never the full SECRET_KEY)
    secret_preview = settings.SECRET_KEY[:5] + "..." if settings.SECRET_KEY else "None"
    logger.info(f"Starting with SECRET_KEY (preview): {secret_preview}")
    logger.info(f"TOKEN_EXPIRE_MINUTES: {settings.ACCESS_TOKEN_EXPIRE_MINUTES}")

    # Initialize user database (SQLite)
    try:
        # Call only once to prevent multiple initialization
        init_user_db()
    except Exception as e:
        logger.error(f"Error initializing user DB: {str(e)}")

    # Initialize main database for table data
    try:
        await init_db()
    except Exception as e:
        logger.error(f"Error initializing main DB: {str(e)}")

    # Initialize Redis
    try:
        await init_redis_pool()
    except Exception as e:
        logger.error(f"Error initializing Redis: {str(e)}")

    logger.info("Application startup complete")


if __name__ == "__main__":
    import uvicorn

    # Optimize for production-like performance
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        workers=4,
        loop="uvloop",
        http="httptools",
        log_level="warning",
        reload=False
    )