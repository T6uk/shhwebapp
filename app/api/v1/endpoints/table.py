# app/api/v1/endpoints/table.py
from fastapi import APIRouter, Depends, Query, HTTPException, Response, Request

from fastapi import APIRouter, Depends, Query, HTTPException, Response
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional, Dict, Any, List
import logging
import time
import orjson
from fastapi import Form
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models.saved_filter import SavedFilter
from app.api.dependencies import get_current_active_user
from app.models.user import User
from app.core.user_db import get_user_db
from app.services.edit_service import (
    verify_edit_permission, get_editable_columns, update_cell_value,
    get_session_changes, undo_change, check_for_changes
)
from fastapi import Depends, Form, Query
from typing import Optional
from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, Query, HTTPException, Response, Request, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session  # Add this import
from sqlalchemy import text
from typing import Optional, Dict, Any, List, Tuple
import logging
import time
import orjson
import uuid
from datetime import datetime

from app.core.db import get_db
from app.models.table import BigTable
from app.core.cache import get_cache, set_cache, compute_cache_key

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/table", tags=["table"])


@router.get("/data")
async def get_table_data(
        request: Request,  # Add the missing request parameter
        start_row: int = Query(0, ge=0),
        end_row: int = Query(100, ge=1),
        search: Optional[str] = None,
        sort_field: Optional[str] = None,
        sort_dir: Optional[str] = None,
        filter_model: Optional[str] = None,
        db: AsyncSession = Depends(get_db)
):
    """
    Get paginated table data with filtering and sorting
    """
    start_time = time.time()
    try:
        # Add a force_refresh parameter to bypass cache when needed
        force_refresh = "timestamp" in request.query_params

        # Create a cache key from the parameters
        cache_params = {
            "start": start_row,
            "end": end_row,
            "search": search or "",
            "sort_field": sort_field or "",
            "sort_dir": sort_dir or "",
            "filter": filter_model or ""
        }
        cache_key = f"table_data:{await compute_cache_key(cache_params)}"

        # Try to get from cache only if not force refreshing
        cached_data = None
        if not force_refresh:
            cached_data = await get_cache(cache_key)

        if cached_data:
            logger.info(f"Returning cached data in {time.time() - start_time:.3f}s")
            # Convert cached_data to bytes for faster response
            return Response(
                content=orjson.dumps(cached_data),
                media_type="application/json"
            )

        # Build query to get paginated data with total count in one query
        # This is an optimization to avoid two separate database round-trips
        sql_parts = []
        params = {}

        # Count query
        count_sql = f'SELECT COUNT(*) FROM "{BigTable.name}"'

        # Data query
        data_sql = f'SELECT * FROM "{BigTable.name}"'

        # Add search if provided
        if search:
            # Find string columns for searching
            col_sql = f"""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = '{BigTable.name}'
                  AND data_type IN ('character varying', 'text', 'char', 'varchar')
            """
            col_result = await db.execute(text(col_sql))
            string_cols = [row[0] for row in col_result.fetchall()]

            if string_cols:
                search_conditions = []
                for col in string_cols:
                    search_conditions.append(f'"{col}"::text ILIKE :search')

                where_clause = f" WHERE ({' OR '.join(search_conditions)})"
                count_sql += where_clause
                data_sql += where_clause
                params["search"] = f"%{search}%"

        # Add sorting to data query
        if sort_field:
            direction = "DESC" if sort_dir and sort_dir.lower() == "desc" else "ASC"
            data_sql += f' ORDER BY "{sort_field}" {direction}'
        else:
            # Default ordering by the first column
            data_sql += ' ORDER BY 1'

        # Add pagination
        data_sql += ' LIMIT :limit OFFSET :offset'
        params["limit"] = end_row - start_row
        params["offset"] = start_row

        # Execute count query
        count_result = await db.execute(text(count_sql), params)
        total_rows = count_result.scalar() or 0

        # Execute data query
        logger.info(f"Executing query: {data_sql} with params: {params}")
        result = await db.execute(text(data_sql), params)
        rows = result.fetchall()

        # Convert to list of dicts for JSON response
        data = []
        for row in rows:
            row_dict = {}
            for key in row._mapping.keys():
                value = row._mapping[key]
                # Handle datetime objects for JSON serialization
                if hasattr(value, 'isoformat'):
                    row_dict[str(key)] = value.isoformat()
                else:
                    row_dict[str(key)] = value
            data.append(row_dict)

        logger.info(f"Returning {len(data)} rows (of total {total_rows}) in {time.time() - start_time:.3f}s")

        # Create response with row count info
        response_data = {
            "rowData": data,
            "rowCount": total_rows,
            "startRow": start_row,
            "endRow": min(start_row + len(data), total_rows)
        }

        # Cache the result (5 minutes TTL for paginated results)
        await set_cache(cache_key, response_data, expire=60)

        # Return using orjson for faster serialization
        return Response(
            content=orjson.dumps(response_data),
            media_type="application/json"
        )

    except Exception as e:
        logger.exception(f"Error getting table data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/columns")
async def get_columns(
        db: AsyncSession = Depends(get_db),
        response: Response = None
):
    """
    Get table columns metadata for frontend
    """
    start_time = time.time()
    try:
        # Try to get from cache
        cached_columns = await get_cache("table_columns")
        if cached_columns:
            logger.info(f"Returning cached columns in {time.time() - start_time:.3f}s")
            # Set cache control header for browser caching
            if response:
                response.headers["Cache-Control"] = "public, max-age=86400"
            return Response(
                content=orjson.dumps(cached_columns),
                media_type="application/json",
                headers={"Cache-Control": "public, max-age=86400"}
            )

        # Get column information directly from information_schema
        sql = f"""
            SELECT 
                column_name,
                data_type,
                column_default,
                is_nullable
            FROM 
                information_schema.columns
            WHERE 
                table_name = '{BigTable.name}'
            ORDER BY 
                ordinal_position
        """

        result = await db.execute(text(sql))
        rows = result.fetchall()

        columns = []
        for row in rows:
            column_name = row[0]
            data_type = row[1]
            column_default = row[2]
            is_nullable = row[3]

            column_info = {
                "field": column_name,
                "title": column_name.capitalize().replace("_", " "),
                "type": data_type,
                "nullable": is_nullable == "YES",
                "hasDefault": column_default is not None
            }
            columns.append(column_info)

        logger.info(f"Returning {len(columns)} columns in {time.time() - start_time:.3f}s")

        # Create response and cache it (24 hour TTL for schema info)
        response_data = {"columns": columns}
        await set_cache("table_columns", response_data, expire=86400)

        # Set cache control header for browser caching
        return Response(
            content=orjson.dumps(response_data),
            media_type="application/json",
            headers={"Cache-Control": "public, max-age=86400"}
        )

    except Exception as e:
        logger.exception(f"Error getting columns: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/editable-columns")
async def get_editable_columns_endpoint(
        db: Session = Depends(get_user_db),
        current_user: User = Depends(get_current_active_user)
):
    """Get which columns are editable for the current user"""
    editable_columns = await get_editable_columns(db, current_user)

    return {
        "columns": editable_columns,
        "can_edit": current_user.can_edit
    }


@router.post("/verify-edit-password")
async def verify_edit_password_endpoint(
        password: str = Form(...),
        current_user: User = Depends(get_current_active_user)
):
    """Verify the edit password to enable editing mode"""
    is_valid = await verify_edit_permission(current_user, password)

    if is_valid:
        # Generate a session ID for tracking changes
        session_id = str(uuid.uuid4())
        return {
            "success": True,
            "session_id": session_id,
            "message": "Edit mode enabled successfully"
        }

    return {
        "success": False,
        "message": "Invalid password or you don't have edit permission"
    }


@router.post("/update-cell")
async def update_cell_endpoint(
        request: Request,
        table_name: str = Form(...),
        row_id: str = Form(...),
        column_name: str = Form(...),
        old_value: Optional[str] = Form(None),
        new_value: str = Form(...),
        session_id: str = Form(...),
        db: AsyncSession = Depends(get_db),
        user_db: Session = Depends(get_user_db),
        current_user: User = Depends(get_current_active_user)
):
    """Update a cell value with change tracking"""
    success = await update_cell_value(
        db,
        user_db,
        current_user,
        table_name,
        row_id,
        column_name,
        old_value,
        new_value,
        session_id,
        client_ip=request.client.host,
        user_agent=request.headers.get("User-Agent", "")
    )

    return {"success": success}


@router.get("/session-changes/{session_id}")
async def get_session_changes_endpoint(
        session_id: str,
        user_db: Session = Depends(get_user_db),
        current_user: User = Depends(get_current_active_user)
):
    """Get all changes made in a session for undo functionality"""
    changes = await get_session_changes(user_db, current_user, session_id)

    return {
        "changes": [
            {
                "id": change.id,
                "table_name": change.table_name,
                "row_id": change.row_id,
                "column_name": change.column_name,
                "old_value": change.old_value,
                "new_value": change.new_value,
                "changed_at": change.changed_at.isoformat()
            }
            for change in changes
        ]
    }


@router.post("/undo-change/{change_id}")
async def undo_change_endpoint(
        request: Request,
        change_id: int,
        db: AsyncSession = Depends(get_db),
        user_db: Session = Depends(get_user_db),
        current_user: User = Depends(get_current_active_user)
):
    """Undo a specific change"""
    success = await undo_change(
        db,
        user_db,
        current_user,
        change_id,
        client_ip=request.client.host,
        user_agent=request.headers.get("User-Agent", "")
    )

    return {"success": success}


@router.get("/check-for-changes")
async def check_for_changes_endpoint(
        last_checked: Optional[str] = Query(None),
        user_db: Session = Depends(get_user_db),
        current_user: User = Depends(get_current_active_user)
):
    """Check if there are changes from other users since last check"""
    last_checked_time = None
    if last_checked:
        try:
            last_checked_time = datetime.fromisoformat(last_checked)
        except ValueError:
            pass

    result = await check_for_changes(user_db, current_user, last_checked_time)
    return result


@router.get("/filter-values/{column_name}")
async def get_filter_values(
        column_name: str,
        search: Optional[str] = None,
        limit: int = Query(100, ge=1, le=1000),
        db: AsyncSession = Depends(get_db)
):
    """Get available values for a column to populate filter dropdowns"""
    try:
        from app.services.data_loader import get_available_filter_values

        values = await get_available_filter_values(db, column_name, search, limit)

        return {
            "values": values,
            "count": len(values)
        }

    except Exception as e:
        logger.exception(f"Error getting filter values: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting filter values: {str(e)}")


@router.post("/save-filter")
async def save_filter(
        name: str = Form(...),
        description: Optional[str] = Form(None),
        filter_model: str = Form(...),
        is_public: bool = Form(False),
        db: Session = Depends(get_user_db),
        current_user: User = Depends(get_current_active_user)
):
    """Save a filter configuration for later use"""
    try:
        # Create a new filter model
        new_filter = SavedFilter(
            name=name,
            description=description,
            filter_model=filter_model,
            is_public=is_public,
            user_id=current_user.id,
            created_at=datetime.utcnow()
        )

        db.add(new_filter)
        db.commit()
        db.refresh(new_filter)

        return {
            "id": new_filter.id,
            "name": new_filter.name,
            "message": "Filter saved successfully"
        }

    except Exception as e:
        logger.exception(f"Error saving filter: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error saving filter: {str(e)}")


@router.get("/saved-filters")
async def get_saved_filters(
        db: Session = Depends(get_user_db),
        current_user: User = Depends(get_current_active_user)
):
    """Get all saved filters for the current user plus public filters"""
    try:
        # Get user's filters and public filters
        filters = db.query(SavedFilter).filter(
            or_(
                SavedFilter.user_id == current_user.id,
                SavedFilter.is_public == True
            )
        ).order_by(SavedFilter.name).all()

        return {
            "filters": [
                {
                    "id": f.id,
                    "name": f.name,
                    "description": f.description,
                    "is_public": f.is_public,
                    "created_at": f.created_at.isoformat(),
                    "is_owner": f.user_id == current_user.id
                }
                for f in filters
            ]
        }

    except Exception as e:
        logger.exception(f"Error getting saved filters: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting saved filters: {str(e)}")


@router.get("/saved-filter/{filter_id}")
async def get_saved_filter(
        filter_id: int,
        db: Session = Depends(get_user_db),
        current_user: User = Depends(get_current_active_user)
):
    """Get a specific saved filter"""
    try:
        # Get the filter
        filter = db.query(SavedFilter).filter(SavedFilter.id == filter_id).first()

        if not filter:
            raise HTTPException(status_code=404, detail="Filter not found")

        # Check if user has access (owner or public filter)
        if filter.user_id != current_user.id and not filter.is_public:
            raise HTTPException(status_code=403, detail="Access denied to this filter")

        return {
            "id": filter.id,
            "name": filter.name,
            "description": filter.description,
            "filter_model": filter.filter_model,
            "is_public": filter.is_public,
            "created_at": filter.created_at.isoformat(),
            "is_owner": filter.user_id == current_user.id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting filter details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting filter details: {str(e)}")


@router.delete("/saved-filter/{filter_id}")
async def delete_saved_filter(
        filter_id: int,
        db: Session = Depends(get_user_db),
        current_user: User = Depends(get_current_active_user)
):
    """Delete a saved filter"""
    try:
        # Get the filter
        filter = db.query(SavedFilter).filter(SavedFilter.id == filter_id).first()

        if not filter:
            raise HTTPException(status_code=404, detail="Filter not found")

        # Check if user is the owner
        if filter.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only delete your own filters")

        # Delete the filter
        db.delete(filter)
        db.commit()

        return {
            "message": "Filter deleted successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting filter: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting filter: {str(e)}")