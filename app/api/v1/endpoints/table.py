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
from datetime import datetime, date
from sqlalchemy.orm import Session
import json
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
        request: Request,
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
        # Build SQL query components
        where_clauses = []
        query_params = {}

        # Get column data types for proper type conversion - cache this to improve performance
        column_types = {}
        try:
            # Get table column information including data types
            schema_query = """
                SELECT column_name, data_type, udt_name 
                FROM information_schema.columns 
                WHERE table_name = :table_name
            """
            schema_result = await db.execute(text(schema_query), {"table_name": BigTable.name})

            for row in schema_result:
                column_name = row[0]
                data_type = row[1]
                udt_name = row[2]
                column_types[column_name] = {
                    "data_type": data_type,
                    "udt_name": udt_name
                }

            logger.info(f"Retrieved column types: {column_types}")
        except Exception as e:
            logger.error(f"Error getting column types: {str(e)}")
            # Continue without type information - we'll try to guess types

        # Log received filter model for debugging
        logger.info(f"Received filter_model: {filter_model}")

        # Add search filters if provided
        if search:
            search_value = f"%{search}%"
            query_params["search_value"] = search_value

            # Get text columns for searching
            text_cols_query = """
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = :table_name
                AND data_type IN ('character varying', 'text', 'character', 'varchar')
            """
            text_cols_result = await db.execute(text(text_cols_query), {"table_name": BigTable.name})
            text_cols = [row[0] for row in text_cols_result.fetchall()]

            if text_cols:
                search_conditions = [f'"{col}"::text ILIKE :search_value' for col in text_cols]
                where_clauses.append(f"({' OR '.join(search_conditions)})")

        # Process filter model if provided
        if filter_model:
            try:
                # Try to parse the filter model
                try:
                    filters = json.loads(filter_model)
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON in filter_model: {filter_model}")
                    raise ValueError("Invalid filter model format")

                logger.info(f"Parsed filters: {filters}")

                # Process each filter
                filter_idx = 0
                for field, filter_config in filters.items():
                    filter_type = filter_config.get('type')
                    filter_value = filter_config.get('filter')

                    logger.info(f"Processing filter: field={field}, type={filter_type}, value={filter_value}")

                    # Skip if field doesn't exist in the table
                    if field not in column_types and field != "id":  # Always allow "id"
                        logger.warning(f"Field {field} not found in table schema")
                        continue

                    # Convert value based on column type
                    converted_value = filter_value
                    try:
                        # Get column type info
                        col_type_info = column_types.get(field, {})
                        col_type = col_type_info.get("data_type", "").lower()
                        udt_name = col_type_info.get("udt_name", "").lower()

                        # Convert value based on column type
                        if field == "id" or col_type in ("integer", "bigint", "smallint") or udt_name in (
                        "int4", "int8", "int2"):
                            # Handle integer types
                            if filter_value is not None and filter_value != "":
                                if isinstance(filter_value, dict):  # For inRange
                                    if 'from' in filter_value and filter_value['from']:
                                        filter_value['from'] = int(filter_value['from'])
                                    if 'to' in filter_value and filter_value['to']:
                                        filter_value['to'] = int(filter_value['to'])
                                    converted_value = filter_value
                                else:
                                    converted_value = int(filter_value)

                        elif col_type in ("numeric", "decimal", "real", "double precision", "float") or udt_name in (
                        "numeric", "float4", "float8"):
                            # Handle float types
                            if filter_value is not None and filter_value != "":
                                if isinstance(filter_value, dict):  # For inRange
                                    if 'from' in filter_value and filter_value['from']:
                                        filter_value['from'] = float(filter_value['from'])
                                    if 'to' in filter_value and filter_value['to']:
                                        filter_value['to'] = float(filter_value['to'])
                                    converted_value = filter_value
                                else:
                                    converted_value = float(filter_value)

                        # Date types will be handled as strings but with proper formatting
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Error converting value for {field}: {e}")
                        # Continue with the original value

                    logger.info(f"Converted value for {field}: {filter_value} -> {converted_value}")

                    # Special case for ID column when type info is missing - assume integer
                    if field == "id" and filter_value is not None and not isinstance(filter_value, dict):
                        try:
                            converted_value = int(filter_value)
                        except (ValueError, TypeError):
                            logger.warning(f"Cannot convert ID value {filter_value} to integer")

                    # Handle each filter type
                    if filter_type == 'contains':
                        param_name = f"filter_{filter_idx}"
                        where_clauses.append(f'"{field}"::text ILIKE :{param_name}')
                        query_params[param_name] = f"%{filter_value}%"
                        filter_idx += 1

                    elif filter_type == 'equals':
                        param_name = f"filter_{filter_idx}"
                        where_clauses.append(f'"{field}" = :{param_name}')
                        query_params[param_name] = converted_value
                        filter_idx += 1

                    elif filter_type == 'notEqual':
                        param_name = f"filter_{filter_idx}"
                        where_clauses.append(f'"{field}" != :{param_name}')
                        query_params[param_name] = converted_value
                        filter_idx += 1

                    elif filter_type == 'startsWith':
                        param_name = f"filter_{filter_idx}"
                        where_clauses.append(f'"{field}"::text ILIKE :{param_name}')
                        query_params[param_name] = f"{filter_value}%"
                        filter_idx += 1

                    elif filter_type == 'endsWith':
                        param_name = f"filter_{filter_idx}"
                        where_clauses.append(f'"{field}"::text ILIKE :{param_name}')
                        query_params[param_name] = f"%{filter_value}"
                        filter_idx += 1

                    elif filter_type == 'blank':
                        where_clauses.append(f'("{field}" IS NULL OR "{field}" = \'\')')

                    elif filter_type == 'notBlank':
                        where_clauses.append(f'("{field}" IS NOT NULL AND "{field}" != \'\')')

                    elif filter_type == 'greaterThan':
                        param_name = f"filter_{filter_idx}"
                        where_clauses.append(f'"{field}" > :{param_name}')
                        query_params[param_name] = converted_value
                        filter_idx += 1

                    elif filter_type == 'lessThan':
                        param_name = f"filter_{filter_idx}"
                        where_clauses.append(f'"{field}" < :{param_name}')
                        query_params[param_name] = converted_value
                        filter_idx += 1

                    elif filter_type == 'greaterThanOrEqual':
                        param_name = f"filter_{filter_idx}"
                        where_clauses.append(f'"{field}" >= :{param_name}')
                        query_params[param_name] = converted_value
                        filter_idx += 1

                    elif filter_type == 'lessThanOrEqual':
                        param_name = f"filter_{filter_idx}"
                        where_clauses.append(f'"{field}" <= :{param_name}')
                        query_params[param_name] = converted_value
                        filter_idx += 1

                    elif filter_type == 'inRange' and isinstance(converted_value, dict):
                        from_value = converted_value.get('from')
                        to_value = converted_value.get('to')

                        if from_value is not None:
                            param_name = f"filter_{filter_idx}"
                            where_clauses.append(f'"{field}" >= :{param_name}')
                            query_params[param_name] = from_value
                            filter_idx += 1

                        if to_value is not None:
                            param_name = f"filter_{filter_idx}"
                            where_clauses.append(f'"{field}" <= :{param_name}')
                            query_params[param_name] = to_value
                            filter_idx += 1

            except Exception as e:
                logger.error(f"Error processing filter model: {str(e)}", exc_info=True)
                # Continue without failing - best effort filtering

        # Combine WHERE clauses
        where_sql = ""
        if where_clauses:
            where_sql = f" WHERE {' AND '.join(where_clauses)}"

        # Log the final SQL for debugging
        logger.info(f"WHERE clause: {where_sql}")
        logger.info(f"Query params: {query_params}")

        # Build and execute count query
        count_sql = f'SELECT COUNT(*) FROM "{BigTable.name}"{where_sql}'
        count_result = await db.execute(text(count_sql), query_params)
        total_rows = count_result.scalar() or 0

        # Build and execute data query with sorting and pagination
        data_sql = f'SELECT * FROM "{BigTable.name}"{where_sql}'
        if sort_field:
            sort_direction = "DESC" if sort_dir and sort_dir.lower() == "desc" else "ASC"
            data_sql += f' ORDER BY "{sort_field}" {sort_direction}'
        else:
            data_sql += ' ORDER BY 1'  # Default sort

        # Add pagination
        data_sql += ' LIMIT :limit OFFSET :offset'
        query_params["limit"] = end_row - start_row
        query_params["offset"] = start_row

        # Execute data query
        result = await db.execute(text(data_sql), query_params)
        rows = result.fetchall()

        # Convert to list of dicts for JSON response
        data = []
        for row in rows:
            row_dict = {}
            for key in row._mapping.keys():
                value = row._mapping[key]
                # Handle datetime objects for JSON serialization
                if isinstance(value, (datetime, date)):
                    row_dict[str(key)] = value.isoformat()
                else:
                    row_dict[str(key)] = value
            data.append(row_dict)

        logger.info(f"Query returned {len(data)} rows out of {total_rows} total in {time.time() - start_time:.3f}s")

        # Create response with row count info
        response_data = {
            "rowData": data,
            "rowCount": total_rows,
            "startRow": start_row,
            "endRow": min(start_row + len(data), total_rows)
        }

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