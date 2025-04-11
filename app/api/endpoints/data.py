from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import inspect
from typing import List, Dict, Any, Optional
import json
import traceback
import asyncio

from app.database import get_db
from app.models.data_models import DataTable, TableSchema
from app.services.data_service import get_table_columns
from app.services.direct_data_service import get_direct_table_data, update_direct_table_row, clear_table_cache
from app.templates import templates
from app.config import settings

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

# Active WebSocket connections for broadcasting updates
active_connections = []


def get_column_groups(db: Session, table_name: str) -> Dict[str, List[Dict[str, Any]]]:
    """Get column groups with metadata for the toolbar"""
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

        return result
    except Exception as e:
        print(f"Error getting column groups: {str(e)}")
        return {}


@router.get("/tables")
def get_tables(db: Session = Depends(get_db)):
    """Get a list of all available tables"""
    # Since we're specializing for taitur_data, just return that
    return {"tables": ["taitur_data"]}


@router.get("/table/{table_name}/schema")
def get_schema(table_name: str, db: Session = Depends(get_db)):
    """Get the schema for a specific table"""
    try:
        # Get directly from PostgreSQL
        inspector = inspect(db.bind)
        try:
            pg_columns = inspector.get_columns(table_name)
            columns = []

            for i, col in enumerate(pg_columns):
                column_type = str(col['type'])
                simple_type = 'text'  # Default

                # Simple type mapping
                if 'int' in column_type.lower():
                    simple_type = 'integer'
                elif any(x in column_type.lower() for x in ['float', 'double', 'numeric', 'decimal']):
                    simple_type = 'number'
                elif any(x in column_type.lower() for x in ['date', 'time']):
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

        return {"columns": columns}
    except Exception as e:
        print(f"Error in get_schema: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/table/{table_name}/data")
def get_data(
        table_name: str,
        draw: int = Query(1),
        start: int = Query(0),
        length: int = Query(50),  # Increased default from 10 to 50
        search_value: Optional[str] = Query(None, alias="search[value]"),
        order_column: Optional[int] = Query(0, alias="order[0][column]"),
        order_dir: Optional[str] = Query("asc", alias="order[0][dir]"),
        columns: Optional[str] = Query(None),  # New parameter to select specific columns
        use_cache: bool = Query(True),  # New parameter to control caching
        db: Session = Depends(get_db)
):
    """
    Get data in DataTables format with support for filtering, sorting, and optional caching
    """
    try:
        print(f"Processing request: draw={draw}, start={start}, length={length}, search={search_value}")

        # Enforce max page size
        if length > settings.MAX_PAGE_SIZE:
            length = settings.MAX_PAGE_SIZE

        # Calculate page from start and length
        page = (start // length) + 1 if length > 0 else 1

        # Get column name to sort by (default to first column)
        inspector = inspect(db.bind)
        try:
            all_columns = inspector.get_columns(table_name)
            sort_column = all_columns[order_column]['name'] if order_column < len(all_columns) else None
            print(f"Sort column: {sort_column}, Direction: {order_dir}")
        except Exception as e:
            print(f"Error getting column for sorting: {e}")
            sort_column = None

        # Convert parameters to our direct_data_service format
        data, total = get_direct_table_data(
            db,
            table_name,
            page=page,
            page_size=length,
            search=search_value,
            sort_by=sort_column,
            sort_desc=(order_dir.lower() == "desc"),
            use_cache=use_cache,
            cache_ttl=settings.CACHE_TTL
        )

        # Format response in DataTables expected format
        response = {
            "draw": draw,
            "recordsTotal": total,
            "recordsFiltered": total,
            "data": data
        }

        return response
    except Exception as e:
        # Log the error for server-side troubleshooting
        print(f"Error in get_data: {str(e)}")
        print(traceback.format_exc())
        # Return error in a format DataTables can handle
        return {
            "draw": draw,
            "recordsTotal": 0,
            "recordsFiltered": 0,
            "data": [],
            "error": str(e)
        }


@router.get("/table/{table_name}/view")
def view_table(request: Request, table_name: str, db: Session = Depends(get_db)):
    """Render the table HTML page - using specialized template for taitur_data"""
    try:
        # Get column groups for the toolbar
        column_groups = get_column_groups(db, table_name)

        return templates.TemplateResponse(
            "specialized_table.html",
            {
                "request": request,
                "table_name": table_name,
                "column_groups": column_groups
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
    """Update a row in a table"""
    try:
        # Determine primary key column (assume 'id' by default)
        inspector = inspect(db.bind)
        pk_columns = inspector.get_pk_constraint(table_name).get('constrained_columns', [])
        primary_key_col = pk_columns[0] if pk_columns else 'id'

        # Update the row directly
        success = update_direct_table_row(db, table_name, primary_key_col, row_id, row_data)

        if not success:
            raise HTTPException(status_code=404,
                                detail=f"Row {row_id} in table '{table_name}' not found or could not be updated")

        # Broadcast update notification to all connected clients
        broadcast_update(table_name, row_id, row_data)

        return {"success": True, "message": "Row updated successfully"}
    except Exception as e:
        print(f"Error updating row: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error updating row: {str(e)}")


@router.websocket("/ws/table/{table_name}")
async def websocket_endpoint(websocket: WebSocket, table_name: str, db: Session = Depends(get_db)):
    """WebSocket endpoint for streaming data and real-time updates"""
    await websocket.accept()

    # Add connection to active connections
    connection_info = {
        "websocket": websocket,
        "table_name": table_name
    }
    active_connections.append(connection_info)

    try:
        # Initial message
        await websocket.send_json({"type": "connection_established", "table": table_name})

        # Process commands from client
        while True:
            # Wait for client commands
            data = await websocket.receive_json()
            command = data.get("command")

            if command == "fetch_data":
                # Get parameters from request
                start = data.get("start", 0)
                chunk_size = min(data.get("chunk_size", settings.STREAM_CHUNK_SIZE), settings.MAX_PAGE_SIZE)
                search = data.get("search")
                sort_by = data.get("sort_by")
                sort_desc = data.get("sort_desc", False)

                # Calculate page
                page = (start // chunk_size) + 1 if chunk_size > 0 else 1

                # Get data
                chunk_data, total = get_direct_table_data(
                    db,
                    table_name,
                    page=page,
                    page_size=chunk_size,
                    search=search,
                    sort_by=sort_by,
                    sort_desc=sort_desc,
                    use_cache=True
                )

                # Send data back to client
                await websocket.send_json({
                    "type": "data_chunk",
                    "start": start,
                    "total": total,
                    "data": chunk_data
                })

            elif command == "clear_cache":
                # Clear cache for this table
                cleared = clear_table_cache(table_name)
                await websocket.send_json({
                    "type": "cache_cleared",
                    "success": cleared
                })

    except WebSocketDisconnect:
        # Remove from active connections
        active_connections.remove(connection_info)
    except Exception as e:
        print(f"WebSocket error: {str(e)}")
        print(traceback.format_exc())
        # Try to send error message
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass
        # Remove from active connections if still there
        if connection_info in active_connections:
            active_connections.remove(connection_info)


async def broadcast_update(table_name: str, row_id: Any, row_data: Dict[str, Any]):
    """Broadcast update notifications to all connected clients"""
    update_message = {
        "type": "row_updated",
        "table": table_name,
        "row_id": row_id,
        "data": row_data
    }

    for connection in active_connections:
        if connection["table_name"] == table_name:
            try:
                await connection["websocket"].send_json(update_message)
            except Exception as e:
                print(f"Error broadcasting update: {str(e)}")


@router.get("/table/{table_name}/stream")
def stream_data_page(request: Request, table_name: str, db: Session = Depends(get_db)):
    """Render the streaming data page using WebSockets"""
    try:
        # Get column groups for the toolbar
        column_groups = get_column_groups(db, table_name)

        return templates.TemplateResponse(
            "streaming_table.html",
            {
                "request": request,
                "table_name": table_name,
                "column_groups": column_groups,
                "enable_websockets": settings.ENABLE_WEBSOCKETS,
                "stream_chunk_size": settings.STREAM_CHUNK_SIZE
            }
        )
    except Exception as e:
        print(f"Error rendering stream view: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Template error: {str(e)}")


@router.get("/table/{table_name}/refresh-cache")
def refresh_cache(table_name: str, db: Session = Depends(get_db)):
    """Clear cache and reload data for a table"""
    try:
        # Clear existing cache
        cleared = clear_table_cache(table_name)

        # Optionally pre-warm cache with common queries
        data, total = get_direct_table_data(
            db,
            table_name,
            page=1,
            page_size=settings.DEFAULT_PAGE_SIZE,
            use_cache=True
        )

        return {
            "success": True,
            "cache_cleared": cleared,
            "rows_preloaded": len(data),
            "total_rows": total
        }
    except Exception as e:
        print(f"Error refreshing cache: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error refreshing cache: {str(e)}")