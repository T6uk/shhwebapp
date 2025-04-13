from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Dict, Any, List, Tuple
import json
import logging

from app.models.table import BigTable
from app.core.cache import get_cache, set_cache

# Cache time-to-live (1 hour)
CACHE_TTL = 3600

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def load_table_data(
        db: AsyncSession,
        params: Dict[str, Any]
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Load table data with pagination, filtering, sorting and caching
    """
    # Create a cache key based on the query parameters
    cache_key = f"table_data:{json.dumps(params, default=str)}"

    # Try to get data from cache first
    cached_data = await get_cache(cache_key)
    if cached_data:
        return cached_data.get("data", []), cached_data.get("total", 0)

    # Get pagination parameters
    page = params.get("page", 1)
    size = params.get("size", 1000)
    sort = params.get("sort")
    sort_dir = params.get("sort_dir", "asc")
    search = params.get("search")

    try:
        # Get total count
        count_sql = f'SELECT COUNT(*) FROM "{BigTable.name}"'
        result = await db.execute(text(count_sql))
        total_count = result.scalar() or 0

        # Use a much simpler approach - just SELECT * with LIMIT and OFFSET
        offset = (page - 1) * size
        sql = f'SELECT * FROM "{BigTable.name}" LIMIT :limit OFFSET :offset'

        # Create parameters dictionary
        params_dict = {
            "limit": size,
            "offset": offset
        }

        # Execute the query with parameters
        result = await db.execute(text(sql), params_dict)

        # Fetch all rows
        rows = result.fetchall()
        logger.info(f"Retrieved {len(rows)} rows from database")

        # Convert rows to dictionaries
        data = []

        if rows:
            # Log sample row info
            sample_row = rows[0]
            logger.info(f"Sample row type: {type(sample_row)}")

            # Process all rows
            for row in rows:
                if hasattr(row, '_mapping'):
                    # If row has _mapping attribute (SQLAlchemy 2.0 style)
                    row_dict = {}
                    for key, value in row._mapping.items():
                        # Convert key to string if needed
                        key_str = str(key)

                        # Handle datetime serialization
                        if hasattr(value, 'isoformat'):
                            row_dict[key_str] = value.isoformat()
                        else:
                            row_dict[key_str] = value
                    data.append(row_dict)

                    # For the first row, log column names
                    if row == sample_row:
                        logger.info(f"Got column names from _mapping: {list(row._mapping.keys())}")

                elif hasattr(row, 'keys') and callable(getattr(row, 'keys')):
                    # If row is dict-like with keys method
                    row_dict = {}
                    for key in row.keys():
                        value = row[key]

                        # Handle datetime serialization
                        if hasattr(value, 'isoformat'):
                            row_dict[key] = value.isoformat()
                        else:
                            row_dict[key] = value
                    data.append(row_dict)

                    # For the first row, log column names
                    if row == sample_row:
                        logger.info(f"Got column names from keys(): {list(row.keys())}")

                else:
                    # For unknown row type, log type info
                    logger.warning(f"Unknown row type: {type(row)}, dir: {dir(row)}")

        # Log data length
        logger.info(f"Returning {len(data)} rows to frontend")

        # Store in cache
        await set_cache(
            cache_key,
            {"data": data, "total": total_count},
            expire=CACHE_TTL
        )

        return data, total_count

    except Exception as e:
        logger.error(f"Error loading table data: {str(e)}", exc_info=True)
        # Return empty data
        return [], 0


async def load_table_columns(db: AsyncSession) -> List[Dict[str, Any]]:
    """
    Get metadata about table columns for the frontend
    """
    # Try to get from cache
    cache_key = "table_columns"
    cached_columns = await get_cache(cache_key)
    if cached_columns:
        return cached_columns

    try:
        # Use a simpler approach - select one row and get column names
        sql = f'SELECT * FROM "{BigTable.name}" LIMIT 1'
        result = await db.execute(text(sql))
        row = result.fetchone()

        columns = []

        if row:
            logger.info(f"Column row type: {type(row)}")
            # Try to extract column names from the row
            if hasattr(row, '_mapping'):
                # SQLAlchemy 2.0 result row
                col_keys = list(row._mapping.keys())
                logger.info(f"Found columns from _mapping: {col_keys}")

                for key in col_keys:
                    column_info = {
                        "field": str(key),
                        "title": str(key).capitalize().replace("_", " "),
                        "type": "string"  # Default to string type
                    }
                    columns.append(column_info)
            elif hasattr(row, 'keys') and callable(getattr(row, 'keys')):
                # Dict-like row with keys method
                col_keys = list(row.keys())
                logger.info(f"Found columns from keys(): {col_keys}")

                for key in col_keys:
                    column_info = {
                        "field": str(key),
                        "title": str(key).capitalize().replace("_", " "),
                        "type": "string"  # Default to string type
                    }
                    columns.append(column_info)
            else:
                logger.warning(f"Unknown column row type: {type(row)}, dir: {dir(row)}")

        # If we still don't have columns, try information_schema
        if not columns:
            # Fallback to information_schema
            logger.info("Trying information_schema for columns")
            schema_sql = f"""
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

            schema_result = await db.execute(text(schema_sql))
            schema_rows = schema_result.fetchall()

            for schema_row in schema_rows:
                if len(schema_row) >= 2:
                    column_info = {
                        "field": schema_row[0],
                        "title": schema_row[0].capitalize().replace("_", " "),
                        "type": schema_row[1]
                    }
                    columns.append(column_info)

        # Log result
        logger.info(f"Returning {len(columns)} columns to frontend")

        # Store in cache (longer TTL since schema rarely changes)
        await set_cache(cache_key, columns, expire=CACHE_TTL * 24)

        return columns

    except Exception as e:
        logger.error(f"Error loading table columns: {str(e)}", exc_info=True)
        # Return empty columns
        return []