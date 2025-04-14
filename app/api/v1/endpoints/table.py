# app/api/v1/endpoints/table.py
import logging
import time
from typing import Optional

import orjson
from fastapi import APIRouter, Depends, Query, HTTPException, Response, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import JSONResponse

from app.api.dependencies import get_current_active_user
from app.core.cache import get_cache, set_cache, compute_cache_key, invalidate_cache
from app.core.db import get_db
from app.core.security import verify_token
from app.models.table import BigTable
from app.models.user import User

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/table", tags=["table"])


@router.get("/data")
async def get_table_data(
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

        # Try to get from cache
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
        await set_cache(cache_key, response_data, expire=300)

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
    """Get table columns metadata for frontend"""
    start_time = time.time()
    try:
        # Try to get from cache
        cached_columns = await get_cache("table_columns")
        if cached_columns:
            logger.info(f"Returning cached columns in {time.time() - start_time:.3f}s")
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
                is_nullable,
                CASE WHEN column_name NOT IN ('id', 'created_at', 'updated_at') THEN true ELSE false END as editable
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
            is_editable = row[4]  # Get the editable flag

            column_info = {
                "field": column_name,
                "title": column_name.capitalize().replace("_", " "),
                "type": data_type,
                "nullable": is_nullable == "YES",
                "hasDefault": column_default is not None,
                "editable": is_editable  # Add editable flag to column info
            }
            columns.append(column_info)

        logger.info(f"Returning {len(columns)} columns in {time.time() - start_time:.3f}s")

        # Create response and cache it
        response_data = {"columns": columns}
        await set_cache("table_columns", response_data, expire=86400)

        return Response(
            content=orjson.dumps(response_data),
            media_type="application/json",
            headers={"Cache-Control": "public, max-age=86400"}
        )

    except Exception as e:
        logger.exception(f"Error getting columns: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.put("/cell")
async def update_cell(
        request: Request,
        field: str,
        row_id: int,
        value: str,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_active_user)
):
    """Update a cell value if the user has permission"""
    # Debug logging
    logger.info(f"Cell update request: field={field}, row_id={row_id}, value={value}")
    logger.info(f"User permissions: can_edit={current_user.can_edit}, is_admin={current_user.is_admin}")

    # Log all cookies for debugging
    cookies = request.cookies
    logger.info(f"Cookies: {[f'{k}:{v[:5] if v and len(v) > 5 else v}...' for k, v in cookies.items()]}")

    # Check permissions
    if not current_user.can_edit and not current_user.is_admin:
        logger.warning(f"User {current_user.username} doesn't have edit permissions")
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "You don't have permission to edit data"}
        )

    # Get edit token from multiple sources
    edit_token = None

    # Try cookie first
    edit_token = request.cookies.get("edit_token")

    # Try header
    if not edit_token:
        edit_token = request.headers.get("X-Edit-Token")

    # Try query param
    if not edit_token:
        edit_token = request.query_params.get("edit_token")

    # Check localStorage fallback marker
    use_fallback = request.headers.get("X-Edit-Fallback") == "true"

    # If we have a token or fallback is enabled, proceed
    if not edit_token and not use_fallback:
        logger.warning(f"No edit token found for user {current_user.username}")
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "Edit mode not activated. Please enter your password to enable editing."}
        )

    try:
        # First, check if the column is editable
        sql = f"""
            SELECT COUNT(*) 
            FROM information_schema.columns 
            WHERE table_name = '{BigTable.name}' 
            AND column_name = :column
            AND column_name NOT IN ('id', 'created_at', 'updated_at')
        """
        result = await db.execute(text(sql), {"column": field})
        is_editable = result.scalar() > 0

        if not is_editable:
            logger.warning(f"Column {field} is not editable")
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "This column is not editable"}
            )

        # Retrieve original value first (for logging and potential recovery)
        select_sql = f"""
            SELECT "{field}" 
            FROM "{BigTable.name}" 
            WHERE id = :row_id
        """
        select_result = await db.execute(text(select_sql), {"row_id": row_id})
        original_value = select_result.scalar()

        # Attempt to update the value with proper SQL injection protection
        update_sql = f"""
            UPDATE "{BigTable.name}" 
            SET "{field}" = :value 
            WHERE id = :row_id
        """

        await db.execute(text(update_sql), {"value": value, "row_id": row_id})
        await db.commit()

        # Log the edit for audit purposes
        logger.info(
            f"Cell edited by {current_user.username}: table={BigTable.name}, row={row_id}, field={field}, old={original_value}, new={value}")

        # Invalidate cache for this table
        await invalidate_cache(f"table_data:*")

        return JSONResponse(content={
            "success": True,
            "message": "Cell updated successfully",
            "original_value": original_value,
            "new_value": value,
            "field": field,
            "row_id": row_id
        })

    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating cell: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Database error: {str(e)}"}
        )