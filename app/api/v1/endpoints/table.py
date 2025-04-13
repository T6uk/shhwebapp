# app/api/v1/endpoints/table.py

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional, Dict, Any, List
import logging

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
            logger.info("Returning cached data")
            return cached_data

        # Get total count first
        count_sql = f'SELECT COUNT(*) FROM "{BigTable.name}"'
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

                count_sql += f" WHERE ({' OR '.join(search_conditions)})"
                count_result = await db.execute(text(count_sql), {"search": f"%{search}%"})
            else:
                count_result = await db.execute(text(count_sql))
        else:
            count_result = await db.execute(text(count_sql))

        total_rows = count_result.scalar() or 0

        # Build query to get paginated data
        sql = f'SELECT * FROM "{BigTable.name}"'

        # Add search if provided
        params = {}
        if search:
            # Reuse string columns from above
            if string_cols:
                search_conditions = []
                for col in string_cols:
                    search_conditions.append(f'"{col}"::text ILIKE :search')

                sql += f" WHERE ({' OR '.join(search_conditions)})"
                params["search"] = f"%{search}%"

        # Add sorting
        if sort_field:
            direction = "DESC" if sort_dir and sort_dir.lower() == "desc" else "ASC"
            sql += f' ORDER BY "{sort_field}" {direction}'
        else:
            # Default ordering by the first column
            sql += ' ORDER BY 1'

        # Add pagination
        sql += ' LIMIT :limit OFFSET :offset'
        params["limit"] = end_row - start_row
        params["offset"] = start_row

        # Execute query
        logger.info(f"Executing query: {sql} with params: {params}")
        result = await db.execute(text(sql), params)
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

        logger.info(f"Returning {len(data)} rows (of total {total_rows})")

        # Create response with row count info
        response_data = {
            "rowData": data,
            "rowCount": total_rows,
            "startRow": start_row,
            "endRow": min(start_row + len(data), total_rows)
        }

        # Cache the result (5 minutes TTL for paginated results)
        await set_cache(cache_key, response_data, expire=300)

        return response_data

    except Exception as e:
        logger.exception(f"Error getting table data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/columns")
async def get_columns(
        db: AsyncSession = Depends(get_db)
):
    """
    Get table columns metadata for frontend
    """
    try:
        # Try to get from cache
        cached_columns = await get_cache("table_columns")
        if cached_columns:
            logger.info("Returning cached columns")
            return cached_columns

        # Get column information directly from information_schema
        sql = f"""
            SELECT 
                column_name,
                data_type
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

            column_info = {
                "field": column_name,
                "title": column_name.capitalize().replace("_", " "),
                "type": data_type
            }
            columns.append(column_info)

        logger.info(f"Returning {len(columns)} columns")

        # Create response and cache it (24 hour TTL for schema info)
        response_data = {"columns": columns}
        await set_cache("table_columns", response_data, expire=86400)

        return response_data

    except Exception as e:
        logger.exception(f"Error getting columns: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")