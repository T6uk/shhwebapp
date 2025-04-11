from fastapi import FastAPI, Request, Depends, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import List, Optional, Dict, Any
import time
import logging
from app.db.database import get_db, get_table_info
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, StreamingResponse
from app.services.data_service import DataService
import json
import os
import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create the FastAPI app
app = FastAPI(
    title="PostgreSQL Data Explorer",
    description="A web application for exploring and interacting with PostgreSQL data",
    version="1.0.0"
)

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Render the main dashboard page"""
    return templates.TemplateResponse(
        "index.html",
        {"request": request, "title": "Data Dashboard"}
    )


@app.get("/api/tables")
async def get_tables(db: AsyncSession = Depends(get_db)):
    """Get all available tables in the database"""
    data_service = DataService(db)
    tables = await data_service.get_all_tables()
    return {"tables": tables}


@app.get("/api/tables/{table_name}")
async def get_table_information(
        table_name: str,
        db: AsyncSession = Depends(get_db)
):
    """Get detailed information about a table"""
    data_service = DataService(db)
    table_info = await data_service.get_table_info(table_name)
    return table_info


@app.get("/api/columns")
async def get_columns(
        table_name: Optional[str] = None,
        db: AsyncSession = Depends(get_db)
):
    """Get all columns for a table (or first table if not specified)"""
    data_service = DataService(db)

    if not table_name:
        # Get list of tables and use the first one
        tables = await data_service.get_all_tables()
        if not tables:
            return {"error": "No tables found", "columns": []}
        table_name = tables[0]

    table_info = await data_service.get_table_info(table_name)
    return {"table": table_name, "columns": table_info["columns"]}


@app.get("/api/data")
async def get_data(
        request: Request,
        table_name: Optional[str] = None,
        page: int = Query(1, ge=1),
        page_size: int = Query(100, ge=10, le=1000),
        sort_column: Optional[str] = None,
        sort_direction: Optional[str] = "asc",
        filters: Optional[str] = None,
        search: Optional[str] = None,
        visible_columns: Optional[str] = None,
        db: AsyncSession = Depends(get_db)
):
    """
    Get paginated and filtered data

    - table_name: Name of the table to query (uses first table if not specified)
    - page: Current page number
    - page_size: Items per page
    - sort_column: Column to sort by
    - sort_direction: asc or desc
    - filters: JSON string of filters {column: value} or {column: {op: "eq", value: "value"}}
    - search: Global search term
    - visible_columns: Comma-separated list of columns to return
    """
    start_time = time.time()

    # Process parameters
    filter_dict = {}
    if filters:
        try:
            filter_dict = json.loads(filters)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON in filters parameter")

    columns_list = None
    if visible_columns:
        columns_list = visible_columns.split(",")

    # Get data from service
    data_service = DataService(db)

    # If table is not specified, get first table
    if not table_name:
        tables = await data_service.get_all_tables()
        if not tables:
            return {"error": "No tables found", "data": [], "total": 0}
        table_name = tables[0]

    data, total_count = await data_service.get_paginated_data(
        table_name=table_name,
        page=page,
        page_size=page_size,
        sort_column=sort_column,
        sort_direction=sort_direction,
        filters=filter_dict,
        search=search,
        columns=columns_list
    )

    # Calculate performance metrics
    execution_time = time.time() - start_time

    return {
        "table": table_name,
        "data": data,
        "total": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": (total_count + page_size - 1) // page_size,
        "execution_time": execution_time
    }


@app.get("/api/data/export")
async def export_data(
        table_name: Optional[str] = None,
        format: str = "csv",
        filters: Optional[str] = None,
        visible_columns: Optional[str] = None,
        db: AsyncSession = Depends(get_db)
):
    """
    Export filtered data in CSV, Excel, or JSON format

    - table_name: Name of the table to export
    - format: csv, excel, or json
    - filters: JSON string of filters
    - visible_columns: Comma-separated list of columns to export
    """
    # Process parameters
    filter_dict = {}
    if filters:
        try:
            filter_dict = json.loads(filters)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON in filters parameter")

    columns_list = None
    if visible_columns:
        columns_list = visible_columns.split(",")

    data_service = DataService(db)

    try:
        file_content, filename = await data_service.export_data(
            format=format,
            table_name=table_name,
            filters=filter_dict,
            columns=columns_list
        )

        # Save file temporarily
        tmp_dir = "tmp"
        os.makedirs(tmp_dir, exist_ok=True)
        file_path = os.path.join(tmp_dir, filename)

        with open(file_path, "wb") as f:
            f.write(file_content)

        # Configure content types
        content_types = {
            "csv": "text/csv",
            "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "json": "application/json"
        }

        # Return file for download
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type=content_types.get(format.lower(), "application/octet-stream")
        )

    except Exception as e:
        logger.error(f"Error exporting data: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@app.get("/api/stats")
async def get_statistics(
        table_name: Optional[str] = None,
        columns: Optional[str] = None,
        db: AsyncSession = Depends(get_db)
):
    """
    Get statistical information about the data

    - table_name: Name of the table to analyze
    - columns: Comma-separated list of columns to analyze
    """
    columns_list = None
    if columns:
        columns_list = columns.split(",")

    data_service = DataService(db)
    stats = await data_service.get_data_stats(table_name, columns_list)

    return stats


@app.get("/api/schema")
async def get_database_schema(db: AsyncSession = Depends(get_db)):
    """Get the complete database schema"""
    try:
        table_info = get_table_info()
        return {"tables": table_info}
    except Exception as e:
        logger.error(f"Error getting schema: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get schema: {str(e)}")


@app.get("/health")
async def health_check():
    """Simple health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.datetime.now().isoformat(),
        "version": app.version
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)