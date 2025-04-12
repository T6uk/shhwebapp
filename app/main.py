from fastapi import FastAPI, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
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

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Set up Jinja2 templates
templates = Jinja2Templates(directory="app/templates")

# Include API routers
app.include_router(table.router, prefix=settings.API_V1_STR)

@app.get("/")
async def index(request: Request):
    """Render the main page with the data table"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.on_event("startup")
async def startup_event():
    """Initialize database and Redis connections on startup"""
    # This will reflect the table structure from the database
    await init_db()
    await init_redis_pool()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, workers=4, loop="uvloop")