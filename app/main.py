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

    # If no token, redirect to login
    if not token:
        return RedirectResponse(url="/auth/login", status_code=status.HTTP_303_SEE_OTHER)

    # Verify token
    try:
        # Use the verify_token function from security.py
        payload = await verify_token(token)

        # Continue with the request
        return await call_next(request)

    except HTTPException:
        # Token is invalid, redirect to login
        return RedirectResponse(url="/auth/login", status_code=status.HTTP_303_SEE_OTHER)
    except Exception as e:
        logger.error(f"Auth middleware error: {str(e)}")
        return RedirectResponse(url="/auth/login", status_code=status.HTTP_303_SEE_OTHER)


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