from fastapi import FastAPI, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from fastapi.responses import RedirectResponse

from app.database import get_db, init_db
from app.api.endpoints import data
from app.templates import templates

app = FastAPI(
    title="Taitur Data Viewer",
    version="1.0.0",
    description="Specialized application for viewing and managing taitur_data"
)


# Initialize database tables
@app.on_event("startup")
async def startup_db_client():
    init_db()


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

# Include API routes
app.include_router(data.router, prefix="/api")


@app.get("/")
async def index(request: Request, db: Session = Depends(get_db)):
    """Redirect directly to the taitur_data table"""
    # Get column groups for the toolbar
    column_groups = data.get_column_groups(db, "taitur_data")

    return templates.TemplateResponse(
        "specialized_table.html",
        {
            "request": request,
            "table_name": "taitur_data",
            "column_groups": column_groups
        }
    )


# Handle favicon
@app.get('/favicon.ico')
async def favicon():
    return RedirectResponse(url='/static/favicon.ico')


if __name__ == "__main__":
    import uvicorn

    # Use uvloop for better performance if available
    try:
        import uvloop

        uvloop.install()
        print("Using uvloop for better performance")
    except ImportError:
        pass

    uvicorn.run(app, host="0.0.0.0", port=8000)