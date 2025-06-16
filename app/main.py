# app/main.py

import json
import logging
import time

from fastapi import FastAPI, Request, HTTPException, status
from fastapi import WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.api.v1.endpoints import koondaja
from app.api.v1.endpoints import table
from app.api.v1.endpoints.auth import router as auth_router
from app.core.cache import init_redis_pool
from app.core.config import settings
from app.core.db import init_db
from app.core.security import (
    extract_token_from_request, verify_token
)
from app.core.websocket import connect_client, disconnect_client
# Import cache manager
from app.utils.cache_utils import cache_manager

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

# Add versioned_static helper function to templates
templates.env.globals["cache_manager"] = cache_manager
templates.env.globals["versioned_static"] = lambda path: f"/static/{path}?v={cache_manager.get_version()}"

# Include API routers
app.include_router(table.router, prefix=settings.API_V1_STR)
app.include_router(koondaja.router)
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
        "/manifest.json",
        "/api/v1/cache-version"  # Add our new cache version endpoint as public
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


@app.websocket("/ws")
async def websocket_endpoint(
        websocket: WebSocket,
        token: str = Query(...),
):
    """WebSocket endpoint for real-time notifications"""
    user_id = None

    try:
        # Verify token and get user
        payload = await verify_token(token)
        username = payload.get("sub")

        # Get user from database (using synchronous session)
        from app.models.user import User
        from app.core.user_db import SessionLocal

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.username == username).first()
            if user:
                user_id = user.id
            else:
                logger.warning(f"WebSocket connection attempted with invalid user: {username}")
                await websocket.close(code=1008)  # Policy violation
                return
        finally:
            db.close()

        # Connect client
        await connect_client(websocket, user_id)

        # Listen for messages (mainly for ping/pong to keep connection alive)
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        if user_id:
            await disconnect_client(websocket, user_id)
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        if user_id:
            await disconnect_client(websocket, user_id)


@app.get("/")
async def index(request: Request):
    """Render the main page with the data table with enhanced user data"""
    # Get token from request
    token = extract_token_from_request(request)
    current_user = None
    using_local_db = False

    # Check if using local database
    from app.core.db import is_using_local_db
    using_local_db = is_using_local_db()

    if token:
        try:
            # Verify token and get username
            payload = await verify_token(token)
            username = payload.get("sub")

            # Get user from database with full profile
            from app.models.user import User
            from app.core.user_db import SessionLocal

            db = SessionLocal()
            try:
                current_user = db.query(User).filter(User.username == username).first()

                # Add last login in a nicer format for display
                if current_user and current_user.last_login:
                    from datetime import datetime
                    current_user.formatted_last_login = current_user.last_login.strftime("%d.%m.%Y %H:%M")
                else:
                    current_user.formatted_last_login = "Pole sisse loginud"

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error getting current user: {str(e)}")

    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "current_user": current_user,
            "using_local_db": using_local_db
        }
    )


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Serve favicon"""
    return FileResponse("app/static/icons/favicon.ico")


@app.get("/sw.js", include_in_schema=False)
async def service_worker():
    """Serve service worker at root to ensure proper scope"""
    return FileResponse("app/static/sw.js")


@app.get("/api/v1/cache-version")
async def get_cache_version():
    """Return the current cache version for client-side validation"""
    return {"version": cache_manager.get_version(), "timestamp": int(time.time())}


@app.on_event("startup")
async def startup_event():
    """Initialize resources on startup with better error handling and optimization"""
    import time
    start_time = time.time()
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}")

    # Log cache version for static assets
    logger.info(f"Using cache version: {cache_manager.get_version()}")

    # Setup process ID and create required directories
    import os
    pid = os.getpid()
    logger.info(f"Process ID: {pid}")

    # Ensure required directories exist
    os.makedirs(settings.DATA_DIR, exist_ok=True)
    os.makedirs(settings.LOGS_DIR, exist_ok=True)

    # Log configuration
    logger.info(f"Environment: {'Development' if settings.DEBUG else 'Production'}")
    logger.info(f"Database: {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}")

    # Initialize resources in parallel for faster startup
    # Pre-create the directories to avoid race conditions
    import asyncio

    # Log the SECRET_KEY in a safe way
    secret_preview = settings.SECRET_KEY[:5] + "..." if settings.SECRET_KEY else "None"
    logger.info(f"SECRET_KEY (preview): {secret_preview}")

    # Initialize all components in parallel
    try:
        # Create tasks for parallel initialization
        init_tasks = [
            init_user_db_async(),  # Async wrapper for the sync function
            init_db(),
            init_redis_pool()
        ]

        # Execute tasks concurrently
        results = await asyncio.gather(*init_tasks, return_exceptions=True)

        # Process results
        for i, result in enumerate(results):
            component = ["User Database", "Main Database", "Redis Cache"][i]
            if isinstance(result, Exception):
                logger.error(f"Error initializing {component}: {str(result)}")
            else:
                logger.info(f"{component} initialized successfully")

    except Exception as e:
        logger.error(f"Error during startup: {str(e)}", exc_info=True)

    # Log startup time
    elapsed = time.time() - start_time
    logger.info(f"Application startup completed in {elapsed:.2f} seconds")


async def init_user_db_async():
    """Async wrapper for the sync user_db initialization"""
    import asyncio
    from app.core.user_db import init_user_db

    # Run in a thread pool since it's a synchronous function
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, init_user_db)


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