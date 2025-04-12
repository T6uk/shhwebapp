from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional, Dict, Any, List
import logging
import json

from app.core.db import get_db
from app.models.table import BigTable

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/table", tags=["table"])


@router.get("/data")
async def get_table_data(
        page: int = Query(1, ge=1),
        size: int = Query(100, ge=10, le=1000),
        sort: Optional[str] = None,
        sort_dir: Optional[str] = None,
        search: Optional[str] = None,
        db: AsyncSession = Depends(get_db)
):
    """
    Get paginated table data with optional filtering and sorting
    """
    try:
        # Get total count
        count_sql = f'SELECT COUNT(*) FROM "{BigTable.name}"'
        result = await db.execute(text(count_sql))
        total_count = result.scalar() or 0

        # Build query with paging
        offset = (page - 1) * size
        sql = f'SELECT * FROM "{BigTable.name}"'

        # Add search if provided
        params = {}
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

                sql += f" WHERE ({' OR '.join(search_conditions)})"
                params["search"] = f"%{search}%"

        # Add sorting
        if sort:
            direction = "DESC" if sort_dir and sort_dir.lower() == "desc" else "ASC"
            sql += f' ORDER BY "{sort}" {direction}'
        else:
            # Default ordering by the first column
            sql += ' ORDER BY 1'

        # Add pagination
        sql += " LIMIT :limit OFFSET :offset"
        params["limit"] = size
        params["offset"] = offset

        # Execute query
        result = await db.execute(text(sql), params)
        rows = result.fetchall()

        # Convert to list of dicts for JSON response
        data = []
        for row in rows:
            # Convert SQLAlchemy Row to dict
            row_dict = {}
            for key in row._mapping.keys():
                value = row._mapping[key]
                # Handle datetime objects for JSON serialization
                if hasattr(value, 'isoformat'):
                    row_dict[str(key)] = value.isoformat()
                else:
                    row_dict[str(key)] = value
            data.append(row_dict)

        # Calculate pagination info
        last_page = (total_count + size - 1) // size if size > 0 else 1

        # Create response
        response = {
            "data": data,
            "total": total_count,
            "last_page": last_page
        }

        logger.info(f"Returning {len(data)} rows, total: {total_count}, last_page: {last_page}")

        return response

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

        return {"columns": columns}

    except Exception as e:
        logger.exception(f"Error getting columns: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")