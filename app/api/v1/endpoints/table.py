# app/api/v1/endpoints/table.py
from fastapi import APIRouter, Depends, Query, HTTPException, Response
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional, Dict, Any, List
import logging
import time
import orjson

from app.core.db import get_db
from app.models.table import BigTable
from app.core.cache import get_cache, set_cache, compute_cache_key

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