# app/main.py
from fastapi import FastAPI, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from fastapi.responses import RedirectResponse

from app.database import get_db, init_db
from app.api.endpoints import data
from app.templates import templates
from fastapi.middleware.gzip import GZipMiddleware

# Create FastAPI app with optimized settings
app = FastAPI(
    title="Taitur Data Viewer",
    version="1.0.2",
    description="High-performance application for viewing and managing taitur_data",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)


# Initialize database tables
@app.on_event("startup")
async def startup_db_client():
    init_db()
    print("Application initialized and ready to use!")


# Clean up resources on shutdown
@app.on_event("shutdown")
async def shutdown_event():
    # Add any necessary cleanup code here
    print("Application shutting down, performing cleanup...")


# Set up CORS with optimized settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add GZip compression for faster data transfer
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Include API routes
app.include_router(data.router, prefix="/api")


@app.get("/")
async def index(request: Request, db: Session = Depends(get_db)):
    """Redirect directly to the taitur_data table with optimized loading"""
    # Get column groups for the toolbar
    column_groups = data.get_column_groups(db, "taitur_data")

    # Get table statistics
    table_stats = {}
    try:
        from app.services.direct_data_service import get_table_stats
        table_stats = get_table_stats(db, "taitur_data")
    except Exception as e:
        print(f"Error getting table stats: {e}")

    return templates.TemplateResponse(
        "specialized_table.html",
        {
            "request": request,
            "table_name": "taitur_data",
            "column_groups": column_groups,
            "table_stats": table_stats
        }
    )


# Handle favicon
@app.get('/favicon.ico')
async def favicon():
    return RedirectResponse(url='/static/favicon.ico')


# Health check endpoint
@app.get('/health')
async def health():
    return {"status": "healthy", "version": "1.0.2"}


if __name__ == "__main__":
    import uvicorn

    # Use uvloop for better performance if available
    try:
        import uvloop
        uvloop.install()
        print("Using uvloop for better performance")
    except ImportError:
        print("uvloop not available, using standard event loop")


    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=5000,
        reload=True,
        workers=4,  # Use multiple workers for better performance
        log_level="info"
    )