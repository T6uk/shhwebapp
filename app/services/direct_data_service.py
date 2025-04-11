from sqlalchemy import text, Table, MetaData, select, func, inspect, column, desc, asc, or_, and_
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Tuple, Optional
import json
import traceback
import hashlib
import time
from redis import Redis
from app.config import settings

# Redis client - will be initialized in get_redis_client()
redis_client = None


def get_redis_client():
    """Get or initialize Redis client"""
    global redis_client
    if redis_client is None:
        try:
            redis_client = Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                db=settings.REDIS_DB,
                password=settings.REDIS_PASSWORD,
                decode_responses=False,  # Keep as binary for proper data serialization
                socket_timeout=5
            )
            # Test connection
            redis_client.ping()
        except Exception as e:
            print(f"Redis connection error: {str(e)}")
            redis_client = None
    return redis_client


def get_cache_key(table_name: str, page: int, page_size: int, search: Optional[str], sort_by: Optional[str],
                  sort_desc: bool) -> str:
    """Generate a cache key based on query parameters"""
    key_parts = [
        f"table={table_name}",
        f"page={page}",
        f"size={page_size}",
        f"search={search or ''}",
        f"sort={sort_by or ''}",
        f"desc={sort_desc}"
    ]
    key_str = ":".join(key_parts)
    return f"data:{hashlib.md5(key_str.encode()).hexdigest()}"


def get_direct_table_data(
        db: Session,
        table_name: str,
        page: int = 1,
        page_size: int = 100,
        search: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_desc: bool = False,
        use_cache: bool = True,
        cache_ttl: int = 300  # Cache for 5 minutes by default
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Query data directly from an existing PostgreSQL table with Redis caching.
    Returns tuple of (data, total_count)
    """
    # Try to get from cache if enabled
    if use_cache and settings.USE_REDIS_CACHE:
        redis = get_redis_client()
        if redis:
            cache_key = get_cache_key(table_name, page, page_size, search, sort_by, sort_desc)
            cached_data = redis.get(cache_key)
            if cached_data:
                try:
                    cache_result = json.loads(cached_data)
                    print(f"Cache hit for {cache_key}")
                    return cache_result["data"], cache_result["total"]
                except Exception as e:
                    print(f"Error deserializing cached data: {str(e)}")

    try:
        # Create a dynamic table object
        metadata = MetaData()
        table = Table(table_name, metadata, autoload_with=db.bind)

        # Get column names for logging
        column_names = [col.name for col in table.columns]
        print(f"Table columns: {column_names}")

        # Base query - SQLAlchemy 2.0 style
        query = select(table)
        count_query = select(func.count()).select_from(table)

        # Apply search if provided - search across ALL string columns
        if search and search.strip():
            # Build a list of OR conditions for each string column
            search_conditions = []
            for col in table.columns:
                # Only apply text search to string-like columns
                if str(col.type).startswith(('VARCHAR', 'TEXT', 'CHAR')):
                    search_conditions.append(col.cast(db.bind.dialect.name).ilike(f'%{search}%'))

            if search_conditions:
                search_filter = or_(*search_conditions)
                query = query.where(search_filter)
                count_query = count_query.where(search_filter)

        # Get total count before pagination
        total_result = db.execute(count_query).scalar()
        total = total_result if total_result is not None else 0
        print(f"Total rows: {total}")

        # Apply sorting if provided
        sort_col = None
        if sort_by is not None:
            # Find the column by name - don't use boolean evaluation on column objects
            sort_col = next((col for col in table.columns if col.name.lower() == sort_by.lower()), None)

        if sort_col is not None:
            query = query.order_by(desc(sort_col) if sort_desc else asc(sort_col))
        else:
            # Default sorting by first column
            query = query.order_by(asc(table.columns[0]))

        # Apply pagination - using modern SQLAlchemy approach
        if page > 1:
            query = query.offset((page - 1) * page_size)
        if page_size > 0:
            query = query.limit(page_size)

        # Log the generated SQL query for debugging
        compiled_query = str(query.compile(dialect=db.bind.dialect, compile_kwargs={"literal_binds": True}))
        print(f"SQL Query: {compiled_query}")

        # Execute query with error handling
        try:
            result = db.execute(query)
            rows = result.fetchall()
        except Exception as e:
            print(f"SQL execution error: {str(e)}")
            print(traceback.format_exc())
            # Return empty result set
            return [], 0

        # Convert to list of dictionaries
        data = []
        for row in rows:
            # Convert to dictionary, handling special types
            row_dict = {}
            # Handle the row mapping properly
            for key in row._mapping.keys():
                value = row._mapping[key]
                key_str = str(key)

                # Handle non-JSON serializable types
                if value is not None:
                    try:
                        # Test if value is JSON serializable by serializing to JSON
                        json.dumps({key_str: value})
                        row_dict[key_str] = value
                    except (TypeError, OverflowError):
                        # Convert to string for non-serializable types
                        row_dict[key_str] = str(value)
                else:
                    row_dict[key_str] = None

            data.append(row_dict)

        print(f"Returned {len(data)} rows")
        if data and len(data) > 0:
            print(f"First row keys: {list(data[0].keys())}")

        # Cache the result if enabled
        if use_cache and settings.USE_REDIS_CACHE:
            redis = get_redis_client()
            if redis:
                cache_key = get_cache_key(table_name, page, page_size, search, sort_by, sort_desc)
                try:
                    cache_data = {
                        "data": data,
                        "total": total,
                        "timestamp": time.time()
                    }
                    redis.setex(cache_key, cache_ttl, json.dumps(cache_data))
                    print(f"Cached data with key {cache_key}")
                except Exception as e:
                    print(f"Error caching data: {str(e)}")

        return data, total

    except Exception as e:
        print(f"Error in get_direct_table_data: {str(e)}")
        print(traceback.format_exc())
        # Return empty result on error
        return [], 0


def update_direct_table_row(db: Session, table_name: str, primary_key_col: str, row_id: Any,
                            row_data: Dict[str, Any]) -> bool:
    """Update a row directly in an existing PostgreSQL table"""
    try:
        # Create a dynamic table object
        metadata = MetaData()
        table = Table(table_name, metadata, autoload_with=db.bind)

        # Find the primary key column
        pk_col = next((col for col in table.columns if col.name == primary_key_col), None)

        if pk_col is None:
            print(f"Primary key column '{primary_key_col}' not found in table '{table_name}'")
            return False

        # Build update values - only include columns that exist
        update_values = {}
        for col_name, value in row_data.items():
            if col_name == primary_key_col:
                continue  # Skip primary key

            # Check if column exists in table
            col = next((c for c in table.columns if c.name == col_name), None)
            if col is not None:
                update_values[col] = value

        if not update_values:
            print(f"No valid columns to update in table '{table_name}'")
            return False

        # Execute update using modern syntax
        stmt = table.update().where(pk_col == row_id).values(update_values)
        result = db.execute(stmt)
        db.commit()

        # Invalidate cache for this table after update
        if settings.USE_REDIS_CACHE:
            redis = get_redis_client()
            if redis:
                # Delete all cache entries for this table (using pattern matching)
                pattern = f"data:*table={table_name}*"
                cache_keys = redis.keys(pattern)
                if cache_keys:
                    redis.delete(*cache_keys)
                    print(f"Invalidated {len(cache_keys)} cache entries after row update")

        return result.rowcount > 0

    except Exception as e:
        print(f"Error in update_direct_table_row: {str(e)}")
        print(traceback.format_exc())
        db.rollback()
        return False


def clear_table_cache(table_name: str) -> bool:
    """Clear all cached entries for a specific table"""
    if not settings.USE_REDIS_CACHE:
        return False

    redis = get_redis_client()
    if not redis:
        return False

    try:
        pattern = f"data:*table={table_name}*"
        cache_keys = redis.keys(pattern)
        if cache_keys:
            redis.delete(*cache_keys)
            print(f"Cleared {len(cache_keys)} cache entries for table {table_name}")
            return True
        return False
    except Exception as e:
        print(f"Error clearing table cache: {str(e)}")
        return False