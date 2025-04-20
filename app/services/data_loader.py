# app/services/data_loader.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, func, select
from typing import Dict, Any, List, Tuple, Optional
import json
import logging
from asyncio import gather
from datetime import datetime, date

from app.models.table import BigTable
from app.core.cache import get_cache, set_cache, compute_cache_key

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
    Load table data with enhanced pagination, filtering, sorting and caching with optimized queries
    """
    # Create a cache key based on the query parameters
    cache_key = f"table_data:{await compute_cache_key(params)}"

    # Try to get data from cache first, unless force_refresh is specified
    force_refresh = params.get("force_refresh", False)
    if not force_refresh:
        cached_data = await get_cache(cache_key)
        if cached_data:
            logger.debug(f"Cache hit for {cache_key}")
            return cached_data.get("data", []), cached_data.get("total", 0)

    # Get pagination parameters
    page = params.get("page", 1)
    size = params.get("size", 1000)
    offset = params.get("offset", 0)
    sort = params.get("sort")
    sort_dir = params.get("sort_dir", "asc")
    search = params.get("search")
    filter_model = params.get("filter_model")

    try:
        # Construct SQL queries with more efficient parameter handling
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

        # Enhanced filter model handling - more advanced filtering options
        if filter_model:
            try:
                # Parse filter model - could be a string or already parsed object
                filters = json.loads(filter_model) if isinstance(filter_model, str) else filter_model

                # Log for debugging
                logger.debug(f"Processing filter model: {filters}")

                for field, filter_config in filters.items():
                    # Extract filter type and value
                    filter_type = filter_config.get("type")
                    filter_value = filter_config.get("filter")

                    # Log filter details for debugging
                    logger.debug(f"Processing filter: field={field}, type={filter_type}, value={filter_value}")

                    # Handle range filters with from/to values
                    if filter_type == "inRange" and isinstance(filter_value, dict):
                        from_value = filter_value.get("from")
                        to_value = filter_value.get("to")

                        if from_value is not None:
                            param_name = f"filter_{field}_from"
                            query_params[param_name] = from_value
                            where_clauses.append(f'"{field}" >= :{param_name}')

                        if to_value is not None:
                            param_name = f"filter_{field}_to"
                            query_params[param_name] = to_value
                            where_clauses.append(f'"{field}" <= :{param_name}')

                    # Handle special filters
                    elif filter_type == "blank":
                        where_clauses.append(f'("{field}" IS NULL OR "{field}" = \'\')')

                    elif filter_type == "notBlank":
                        where_clauses.append(f'("{field}" IS NOT NULL AND "{field}" != \'\')')

                    # Handle standard single value filters
                    elif filter_value is not None:
                        param_name = f"filter_{field}"
                        condition = build_filter_condition(field, filter_type, param_name)

                        if condition:
                            where_clauses.append(condition)
                            # Prepare parameter value based on filter type
                            query_params[param_name] = prepare_filter_value(filter_type, filter_value)

            except (json.JSONDecodeError, TypeError) as e:
                logger.warning(f"Invalid filter_model: {filter_model}. Error: {str(e)}")

        # Combine WHERE clauses
        where_sql = ""
        if where_clauses:
            where_sql = "WHERE " + " AND ".join(where_clauses)

        # Log the final WHERE clause for debugging
        logger.debug(f"Final WHERE clause: {where_sql}")
        logger.debug(f"Query parameters: {query_params}")

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
        query_params["offset"] = offset

        # Execute queries in parallel
        count_future = db.execute(text(count_sql), query_params)
        data_future = db.execute(text(data_sql), query_params)

        count_result, data_result = await gather(count_future, data_future)

        total_count = count_result.scalar() or 0
        rows = data_result.fetchall()

        # Process results with optimized data conversion
        data = []
        for row in rows:
            if hasattr(row, '_mapping'):
                row_dict = {}
                for key, value in row._mapping.items():
                    if isinstance(value, (datetime, date)):
                        row_dict[str(key)] = value.isoformat()
                    else:
                        row_dict[str(key)] = value
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


def build_filter_condition(field: str, filter_type: str, param_name: str) -> str:
    """Build SQL condition for different filter types with improved handling"""
    if not filter_type:
        return ""

    # Map filter types to SQL conditions
    filter_map = {
        "equals": f'"{field}" = :{param_name}',
        "notEqual": f'"{field}" != :{param_name}',
        "contains": f'"{field}"::text ILIKE :{param_name}',
        "notContains": f'"{field}"::text NOT ILIKE :{param_name}',
        "startsWith": f'"{field}"::text ILIKE :{param_name}',
        "endsWith": f'"{field}"::text ILIKE :{param_name}',
        "greaterThan": f'"{field}" > :{param_name}',
        "greaterThanOrEqual": f'"{field}" >= :{param_name}',
        "lessThan": f'"{field}" < :{param_name}',
        "lessThanOrEqual": f'"{field}" <= :{param_name}',
        # inRange is handled separately in the main function
    }

    # Get the SQL condition for the filter type
    condition = filter_map.get(filter_type)

    # Log details for debugging
    if condition is None and filter_type != "inRange":
        logger.warning(f"Unknown filter type: {filter_type}")

    return condition or ""


def prepare_filter_value(filter_type: str, value: Any) -> Any:
    """Prepare filter value based on filter type with improved handling"""
    if filter_type == "contains" or filter_type == "notContains":
        return f"%{value}%"
    elif filter_type == "startsWith":
        return f"{value}%"
    elif filter_type == "endsWith":
        return f"%{value}"
    else:
        # For other types, return value as is
        return value


def prepare_filter_value(filter_type: str, value: Any) -> Any:
    """Prepare filter value based on filter type"""
    if filter_type in ["contains", "notContains"]:
        return f"%{value}%"
    elif filter_type == "startsWith":
        return f"{value}%"
    elif filter_type == "endsWith":
        return f"%{value}"
    else:
        return value


async def get_available_filter_values(
        db: AsyncSession,
        column_name: str,
        search_term: Optional[str] = None,
        limit: int = 100
) -> List[Any]:
    """Get unique values for a column to populate filter dropdowns"""
    try:
        # Create a query to get distinct values for the column
        query = f"""
            SELECT DISTINCT "{column_name}" 
            FROM "{BigTable.name}" 
            WHERE "{column_name}" IS NOT NULL 
        """

        params = {}

        # Add search constraint if provided
        if search_term:
            query += f' AND "{column_name}"::text ILIKE :search_term'
            params['search_term'] = f"%{search_term}%"

        # Add order and limit
        query += f' ORDER BY "{column_name}" LIMIT :limit'
        params['limit'] = limit

        # Execute query
        result = await db.execute(text(query), params)
        values = [row[0] for row in result.fetchall()]

        return values

    except Exception as e:
        logger.error(f"Error getting filter values for {column_name}: {str(e)}")
        return []
