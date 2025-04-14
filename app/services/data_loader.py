# app/services/data_loader.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, func, select
from typing import Dict, Any, List, Tuple
import json
import logging
from asyncio import gather

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
    Load table data with pagination, filtering, sorting and caching with optimized queries
    """
    # Create a cache key based on the query parameters
    cache_key = f"table_data:{json.dumps(params, default=str)}"

    # Try to get data from cache first
    cached_data = await get_cache(cache_key)
    if cached_data:
        logger.debug(f"Cache hit for {cache_key}")
        return cached_data.get("data", []), cached_data.get("total", 0)

    # Get pagination parameters
    page = params.get("page", 1)
    size = params.get("size", 1000)
    sort = params.get("sort")
    sort_dir = params.get("sort_dir", "asc")
    search = params.get("search")
    filter_model = params.get("filter_model")

    try:
        # Construct SQL queries more efficiently
        where_clauses = []
        query_params = {}

        # Handle search - optimize to search only on text fields
        if search:
            search_value = f"%{search}%"
            query_params["search_value"] = search_value

            # Get string columns for searching using a more efficient query
            text_columns_sql = """
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = :table_name 
                AND data_type IN ('character varying', 'text', 'character', 'varchar')
            """
            text_columns_result = await db.execute(
                text(text_columns_sql),
                {"table_name": BigTable.name}
            )
            text_columns = [row[0] for row in text_columns_result.fetchall()]

            # Build OR search conditions for all text columns
            if text_columns:
                search_conditions = [
                    f'"{col}"::text ILIKE :search_value' for col in text_columns
                ]
                where_clauses.append(f"({' OR '.join(search_conditions)})")

        # Handle filter model - more complex filtering logic
        if filter_model:
            try:
                filters = json.loads(filter_model)
                for field, filter_config in filters.items():
                    filter_type = filter_config.get("type")
                    filter_value = filter_config.get("filter")

                    if filter_type and filter_value is not None:
                        param_name = f"filter_{field}"

                        if filter_type == "contains":
                            query_params[param_name] = f"%{filter_value}%"
                            where_clauses.append(f'"{field}"::text ILIKE :{param_name}')
                        elif filter_type == "equals":
                            query_params[param_name] = filter_value
                            where_clauses.append(f'"{field}" = :{param_name}')
                        elif filter_type == "startsWith":
                            query_params[param_name] = f"{filter_value}%"
                            where_clauses.append(f'"{field}"::text ILIKE :{param_name}')
                        elif filter_type == "endsWith":
                            query_params[param_name] = f"%{filter_value}"
                            where_clauses.append(f'"{field}"::text ILIKE :{param_name}')
                        elif filter_type == "greaterThan":
                            query_params[param_name] = filter_value
                            where_clauses.append(f'"{field}" > :{param_name}')
                        elif filter_type == "lessThan":
                            query_params[param_name] = filter_value
                            where_clauses.append(f'"{field}" < :{param_name}')
            except json.JSONDecodeError:
                logger.warning(f"Invalid filter_model JSON: {filter_model}")

        # Combine WHERE clauses
        where_sql = ""
        if where_clauses:
            where_sql = "WHERE " + " AND ".join(where_clauses)

        # Execute count query and data query in parallel for better performance
        count_sql = f'SELECT COUNT(*) FROM "{BigTable.name}" {where_sql}'

        # Build data query with sorting
        data_sql = f'SELECT * FROM "{BigTable.name}" {where_sql}'

        if sort:
            sort_direction = "DESC" if sort_dir.upper() == "DESC" else "ASC"
            data_sql += f' ORDER BY "{sort}" {sort_direction}'
        else:
            # Default sort by ID or first column for consistent pagination
            data_sql += ' ORDER BY 1'

        # Add pagination
        data_sql += ' LIMIT :limit OFFSET :offset'

        # Add pagination parameters
        query_params["limit"] = size
        query_params["offset"] = (page - 1) * size

        # Execute queries in parallel using asyncio.gather for better performance
        count_future = db.execute(text(count_sql), query_params)
        data_future = db.execute(text(data_sql), query_params)

        count_result, data_result = await gather(count_future, data_future)

        total_count = count_result.scalar() or 0
        rows = data_result.fetchall()

        # Process results
        data = []
        for row in rows:
            if hasattr(row, '_mapping'):
                row_dict = {str(key): value for key, value in row._mapping.items()}
                # Handle datetime serialization
                for k, v in row_dict.items():
                    if hasattr(v, 'isoformat'):
                        row_dict[k] = v.isoformat()
                data.append(row_dict)

        # Store in cache with TTL
        await set_cache(
            cache_key,
            {"data": data, "total": total_count},
            expire=CACHE_TTL
        )

        logger.info(f"Query returned {len(data)} rows out of {total_count} total")
        return data, total_count

    except Exception as e:
        logger.error(f"Error loading table data: {str(e)}", exc_info=True)
        # Return empty data on error
        return [], 0


async def load_table_columns(db: AsyncSession) -> List[Dict[str, Any]]:
    """
    Get metadata about table columns for the frontend with improved performance
    """
    # Try to get from cache
    cache_key = "table_columns"
    cached_columns = await get_cache(cache_key)
    if cached_columns:
        return cached_columns

    try:
        # More efficient query to get column information directly from information_schema
        schema_sql = f"""
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default,
                ordinal_position
            FROM 
                information_schema.columns
            WHERE 
                table_name = '{BigTable.name}'
            ORDER BY 
                ordinal_position
        """

        schema_result = await db.execute(text(schema_sql))
        schema_rows = schema_result.fetchall()

        columns = []
        for schema_row in schema_rows:
            column_name = schema_row[0]
            data_type = schema_row[1]
            is_nullable = schema_row[2] == 'YES'
            column_default = schema_row[3]

            # Determine best field type for frontend
            field_type = "string"  # Default
            if data_type in ("integer", "bigint", "numeric", "real", "double precision"):
                field_type = "number"
            elif data_type in ("date", "timestamp", "timestamp with time zone"):
                field_type = "date"
            elif data_type in ("boolean"):
                field_type = "boolean"

            column_info = {
                "field": column_name,
                "title": column_name.capitalize().replace("_", " "),
                "type": field_type,
                "dataType": data_type,
                "nullable": is_nullable,
                "hasDefault": column_default is not None
            }
            columns.append(column_info)

        # Cache for 24 hours since schema rarely changes
        await set_cache(cache_key, columns, expire=CACHE_TTL * 24)

        logger.info(f"Retrieved {len(columns)} columns from schema")
        return columns

    except Exception as e:
        logger.error(f"Error loading table columns: {str(e)}", exc_info=True)
        # Return empty columns on error
        return []