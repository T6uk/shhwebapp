from fastapi import FastAPI, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
import os

from app.core.config import settings
from app.core.db import get_db, init_db
from app.core.cache import init_redis_pool
from app.api.v1.endpoints import table

app = FastAPI(title="Big Table App")

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files with caching headers
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Set up Jinja2 templates
templates = Jinja2Templates(directory="app/templates")

# Include API routers
app.include_router(table.router, prefix=settings.API_V1_STR)

@app.get("/")
async def index(request: Request):
    """Render the main page with the data table"""
    return templates.TemplateResponse("index.html", {"request": request})

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
    # This will reflect the table structure from the database
    await init_db()
    await init_redis_pool()

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
        log_level="warning",  # Reduce logging for better performance
        reload=False  # Disable auto-reload in desktop-mode for better performance
    )