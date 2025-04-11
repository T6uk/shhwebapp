from fastapi import APIRouter, Depends, HTTPException, Query, Request, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text
from typing import List, Dict, Any, Optional
import json
import traceback
import time
import asyncio
from fastapi.responses import StreamingResponse
import io
import csv

from app.database import get_db, redis_client, REDIS_AVAILABLE
from app.models.data_models import DataTable, TableSchema
from app.services.data_service import get_table_columns
from app.services.direct_data_service import get_direct_table_data, update_direct_table_row, get_table_stats
from app.templates import templates

router = APIRouter()

# Define column groups for quick navigation in toolbar
COLUMN_GROUPS = {
    "Main Info": ["id", "võlgnik", "toimiku_nr", "toimiku_olek", "toimiku_avamise_kpv", "menetluse_alg_kpv"],
    "Võlgnik": ["võlgniku_tüüp", "võlgniku_perenimi", "võlgniku_eesnimi", "võlgniku_reg_isikukood", "võlgniku_aadress",
                "võlgniku_telefon", "võlgniku_epost"],
    "Sissenõudja": ["sissenõudja_tüüp", "sissenõudja_perenimi", "sissenõudja_eesnimi", "sissenõudja_reg_isikukood",
                    "sissenõudja_aadress", "sissenõudja_telefon", "sissenõudja_epost"],
    "Nõue": ["nõude_sisu", "nõude_suurus", "viitenumber", "lahendi_liik", "lahendi_kpv", "jõustumise_kuupäev"],
    "Tasud": ["täituritasu_suurus", "täitekulu_kokku", "tasud_ja_kulud_kokku", "jäägid_kokku"],
    "Menetlus": ["staatus", "staatuse_kpv", "menetluse_lõpetamise_kpv", "lõpetamise_alus", "märkused"]
}


def get_column_groups(db: Session, table_name: str) -> Dict[str, List[Dict[str, Any]]]:
    """Get column groups with metadata for the toolbar"""
    cache_key = f"taitur:column_groups:{table_name}"

    # Try to get from cache first
    if REDIS_AVAILABLE:
        try:
            cached_data = redis_client.get(cache_key)
            if cached_data:
                import pickle
                return pickle.loads(cached_data)
        except Exception as e:
            print(f"Cache error for column groups: {str(e)}")

    try:
        # Get all columns from table
        inspector = inspect(db.bind)
        columns = inspector.get_columns(table_name)
        column_dict = {col['name']: col for col in columns}

        # Build result with column info for each group
        result = {}
        for group_name, column_names in COLUMN_GROUPS.items():
            # Only include columns that actually exist in the table
            existing_columns = []
            for col_name in column_names:
                if col_name in column_dict:
                    existing_columns.append({
                        "name": col_name,
                        "type": str(column_dict[col_name]["type"])
                    })

            if existing_columns:
                result[group_name] = existing_columns

        # Cache the result
        if REDIS_AVAILABLE:
            try:
                import pickle
                redis_client.setex(cache_key, 3600, pickle.dumps(result))  # Cache for 1 hour
            except Exception as e:
                print(f"Cache store error: {str(e)}")

        return result
    except Exception as e:
        print(f"Error getting column groups: {str(e)}")
        return {}


@router.get("/tables")
def get_tables(db: Session = Depends(get_db)):
    """Get a list of all available tables"""
    return {"tables": ["taitur_data"]}


@router.get("/table/{table_name}/stats")
def get_table_statistics(table_name: str, db: Session = Depends(get_db)):
    """Get statistics about the table to help optimize the frontend"""
    try:
        stats = get_table_stats(db, table_name)
        return stats
    except Exception as e:
        print(f"Error getting table stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting table statistics: {str(e)}")


@router.get("/table/{table_name}/schema")
def get_schema(table_name: str, db: Session = Depends(get_db)):
    """Get the schema for a specific table with optimized caching"""
    cache_key = f"taitur:schema:{table_name}"

    # Try to get from cache first
    if REDIS_AVAILABLE:
        try:
            cached_data = redis_client.get(cache_key)
            if cached_data:
                import pickle
                return pickle.loads(cached_data)
        except Exception as e:
            print(f"Cache error for schema: {str(e)}")

    try:
        # Get directly from PostgreSQL
        inspector = inspect(db.bind)
        try:
            pg_columns = inspector.get_columns(table_name)
            columns = []

            for i, col in enumerate(pg_columns):
                column_type = str(col['type'])
                simple_type = 'text'  # Default

                # Improved type mapping
                if 'int' in column_type.lower():
                    simple_type = 'integer'
                elif any(x in column_type.lower() for x in ['float', 'double', 'numeric', 'decimal']):
                    simple_type = 'number'
                elif any(x in column_type.lower() for x in ['date', 'time', 'timestamp']):
                    simple_type = 'datetime'
                elif 'bool' in column_type.lower():
                    simple_type = 'boolean'

                columns.append({
                    'name': col['name'],
                    'type': simple_type,
                    'required': not col.get('nullable', True),
                    'default': str(col.get('default', '')),
                    'description': '',
                    'visible': True,
                })
        except Exception as e:
            print(f"Error getting schema: {str(e)}")
            print(traceback.format_exc())
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found or error: {str(e)}")

        result = {"columns": columns}

        # Cache the result
        if REDIS_AVAILABLE:
            try:
                import pickle
                redis_client.setex(cache_key, 3600, pickle.dumps(result))  # Cache for 1 hour
            except Exception as e:
                print(f"Cache store error: {str(e)}")

        return result
    except Exception as e:
        print(f"Error in get_schema: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/table/{table_name}/data")
def get_data(
        table_name: str,
        draw: int = Query(1),
        start: int = Query(0),
        length: int = Query(10),
        search_value: Optional[str] = Query(None, alias="search[value]"),
        order_column: Optional[int] = Query(0, alias="order[0][column]"),
        order_dir: Optional[str] = Query("asc", alias="order[0][dir]"),
        db: Session = Depends(get_db)
):
    """
    Get data in DataTables format with optimized performance
    """
    start_time = time.time()
    try:
        print(f"Processing request: draw={draw}, start={start}, length={length}, search={search_value}")

        # Calculate page from start and length
        page = (start // length) + 1 if length > 0 else 1

        # Get column name to sort by
        inspector = inspect(db.bind)
        try:
            columns = inspector.get_columns(table_name)
            sort_column = columns[order_column]['name'] if order_column < len(columns) else None
            print(f"Sort column: {sort_column}, Direction: {order_dir}")
        except Exception as e:
            print(f"Error getting column for sorting: {e}")
            sort_column = None

        # Get data with optimized function
        data, total = get_direct_table_data(
            db,
            table_name,
            page=page,
            page_size=length,
            search=search_value,
            sort_by=sort_column,
            sort_desc=(order_dir.lower() == "desc")
        )

        # Format response in DataTables expected format
        response = {
            "draw": draw,
            "recordsTotal": total,
            "recordsFiltered": total,
            "data": data,
            "query_time": f"{time.time() - start_time:.2f}s"
        }

        return response
    except Exception as e:
        # Log the error
        print(f"Error in get_data: {str(e)}")
        print(traceback.format_exc())
        # Return error in DataTables format
        return {
            "draw": draw,
            "recordsTotal": 0,
            "recordsFiltered": 0,
            "data": [],
            "error": str(e)
        }


@router.get("/table/{table_name}/export")
async def export_table_data(
        background_tasks: BackgroundTasks,
        table_name: str,
        format: str = Query("csv", description="Export format: csv, json, excel"),
        search: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """Export table data in various formats with background processing for large datasets"""

    async def generate_csv():
        """Generate CSV data in chunks to prevent memory issues with large datasets"""
        # Create CSV buffer
        buffer = io.StringIO()
        writer = None

        # Get data in chunks of 5000 rows
        page = 1
        page_size = 5000
        headers_written = False

        while True:
            # Get chunk of data
            data, total = get_direct_table_data(
                db,
                table_name,
                page=page,
                page_size=page_size,
                search=search
            )

            if not data:
                break

            # Write headers if first chunk
            if not headers_written:
                headers = data[0].keys()
                writer = csv.DictWriter(buffer, fieldnames=headers)
                writer.writeheader()
                headers_written = True

            # Write data rows
            for row in data:
                writer.writerow(row)

            # Yield the chunk
            yield buffer.getvalue()

            # Clear buffer for next chunk
            buffer.truncate(0)
            buffer.seek(0)

            # If we've processed all rows, stop
            if page * page_size >= total:
                break

            # Next page
            page += 1

            # Give the server a small break between chunks
            await asyncio.sleep(0.1)

    try:
        if format.lower() == "csv":
            return StreamingResponse(
                generate_csv(),
                media_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename={table_name}_{time.strftime('%Y%m%d')}.csv"
                }
            )
        else:
            # For now, return HTTP 501 Not Implemented for other formats
            # In a production app, we'd implement the other formats with similar streaming approaches
            raise HTTPException(status_code=501, detail=f"Export format '{format}' not yet implemented")
    except Exception as e:
        print(f"Error in export_table_data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Export error: {str(e)}")


@router.get("/table/{table_name}/view")
def view_table(request: Request, table_name: str, db: Session = Depends(get_db)):
    """Render the table HTML page with enhanced performance considerations"""
    try:
        # Get column groups for the toolbar
        column_groups = get_column_groups(db, table_name)

        # Get table statistics to help optimize frontend
        stats = get_table_stats(db, table_name)

        return templates.TemplateResponse(
            "specialized_table.html",
            {
                "request": request,
                "table_name": table_name,
                "column_groups": column_groups,
                "table_stats": stats
            }
        )
    except Exception as e:
        print(f"Error rendering table view: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Template error: {str(e)}")


@router.put("/table/{table_name}/rows/{row_id}")
def update_row(
        table_name: str,
        row_id: str,
        row_data: Dict[str, Any],
        db: Session = Depends(get_db)
):
    """Update a row in a table with optimized cache invalidation"""
    try:
        # Determine primary key column
        inspector = inspect(db.bind)
        pk_columns = inspector.get_pk_constraint(table_name).get('constrained_columns', [])
        primary_key_col = pk_columns[0] if pk_columns else 'id'

        # Update the row with optimized function
        success = update_direct_table_row(db, table_name, primary_key_col, row_id, row_data)

        if not success:
            raise HTTPException(status_code=404,
                                detail=f"Row {row_id} in table '{table_name}' not found or could not be updated")

        return {"success": True, "message": "Row updated successfully"}
    except Exception as e:
        print(f"Error updating row: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error updating row: {str(e)}")