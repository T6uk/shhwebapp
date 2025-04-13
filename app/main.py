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

from app.core.config import settings
from app.core.db import get_db, init_db, sync_engine
from app.core.security import ALGORITHM, get_password_hash
from app.core.cache import init_redis_pool
from app.api.v1.endpoints import table
from app.api.v1.endpoints.auth import router as auth_router
from app.models.user import User, Base as UserBase

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
        "/static/",
        "/favicon.ico",
        "/sw.js"
    ]

    # Check if the path is public
    if any(request.url.path.startswith(path) for path in public_paths):
        return await call_next(request)

    # Pass the request to the next middleware without checking auth
    # We'll let the authentication be handled by the admin route directly
    if request.url.path == "/auth/admin":
        return await call_next(request)

    # Check for token in cookie
    token = request.cookies.get("access_token")
    if token and token.startswith("Bearer "):
        token = token.replace("Bearer ", "")

    # If no token, redirect to login
    if not token:
        return RedirectResponse(url="/auth/login", status_code=status.HTTP_303_SEE_OTHER)

    # Verify token
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            return RedirectResponse(url="/auth/login", status_code=status.HTTP_303_SEE_OTHER)
    except JWTError:
        return RedirectResponse(url="/auth/login", status_code=status.HTTP_303_SEE_OTHER)

    # Continue with the request
    return await call_next(request)


@app.get("/")
async def index(request: Request, db: AsyncSession = Depends(get_db)):
    """Render the main page with the data table"""
    # Get current user from token
    token = request.cookies.get("access_token")
    if token and token.startswith("Bearer "):
        token = token.replace("Bearer ", "")

    current_user = None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username:
            result = await db.execute(select(User).where(User.username == username))
            current_user = result.scalars().first()
    except JWTError:
        pass

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


# Create admin user if it doesn't exist
def create_admin_user():
    # Create tables if they don't exist
    UserBase.metadata.create_all(sync_engine)

    # Check if admin user exists
    with sync_engine.connect() as conn:
        result = conn.execute(select(User).where(User.username == settings.ADMIN_USERNAME))
        user = result.fetchone()

        if not user:
            # Create admin user
            hashed_password = get_password_hash(settings.ADMIN_PASSWORD)
            stmt = User.__table__.insert().values(
                username=settings.ADMIN_USERNAME,
                hashed_password=hashed_password,
                is_active=True,
                is_admin=True
            )
            conn.execute(stmt)
            conn.commit()
            logger.info(f"Admin user '{settings.ADMIN_USERNAME}' created")


@app.on_event("startup")
async def startup_event():
    """Initialize database and Redis connections on startup"""
    # Create admin user
    create_admin_user()

    # Initialize database
    await init_db()
    await init_redis_pool()

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