# app/services/direct_data_service.py
from sqlalchemy import text, Table, MetaData, select, func, inspect, column, desc, asc, or_, and_, cast, String
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Tuple, Optional
import json
import traceback
import time
from app.database import memory_cache
import concurrent.futures
import threading

# Thread-local storage for connection handling
_thread_local = threading.local()


def get_direct_table_data(
        db: Session,
        table_name: str,
        page: int = 1,
        page_size: int = 100,
        search: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_desc: bool = False
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Query data directly from an existing PostgreSQL table with optimized performance.
    Returns tuple of (data, total_count)
    """
    start_time = time.time()

    # Cache key components
    cache_components = [
        table_name,
        f"page={page}",
        f"size={page_size}"
    ]

    if search:
        cache_components.append(f"search={search}")
    if sort_by:
        cache_components.append(f"sort={sort_by}{'_desc' if sort_desc else '_asc'}")

    cache_key = f"taitur:direct_data:{'_'.join(cache_components)}"

    # Try to get from cache first
    cached_data = memory_cache.get(cache_key)
    if cached_data:
        elapsed = time.time() - start_time
        print(f"Cache hit for {cache_key}, returned in {elapsed:.2f}s")
        return cached_data

    try:
        # Create dynamic table object
        metadata = MetaData()
        table = Table(table_name, metadata, autoload_with=db.bind)

        # Base query
        query = select(table)
        count_query = None
        total = 0

        # Apply search using optimized approach for Windows compatibility
        if search and search.strip():
            # Improved search approach
            search_conditions = []

            # For text columns, use ILIKE for case-insensitive search
            for col in table.columns:
                col_type = str(col.type).lower()
                if any(t in col_type for t in ('varchar', 'text', 'char')):
                    search_conditions.append(col.cast(String).ilike(f'%{search}%'))

            # Add numeric and other type searches if needed
            # This helps when searching for numeric values as strings
            for col in table.columns:
                col_type = str(col.type).lower()
                if any(t in col_type for t in ('int', 'float', 'numeric', 'decimal')):
                    try:
                        # Try to convert search term to number for numeric columns
                        if search.isdigit():
                            search_conditions.append(col == int(search))
                        elif search.replace('.', '', 1).isdigit():
                            search_conditions.append(col == float(search))
                    except (ValueError, TypeError):
                        pass

            if search_conditions:
                search_filter = or_(*search_conditions)
                query = query.where(search_filter)
                # When searching, we need a count for pagination
                count_query = select(func.count()).select_from(table).where(search_filter)

        # Get count if first page or searching
        if count_query is not None or page == 1:
            if count_query is None:
                count_query = select(func.count()).select_from(table)

            # Execute count query with timeout
            try:
                # Use connection timeout to avoid blocking on large tables
                with db.execute(count_query.execution_options(
                        stream_results=True,
                        timeout=5
                )) as result:
                    total = result.scalar() or 0
            except Exception as e:
                print(f"Count query error: {str(e)}")
                # Estimate for large tables
                total = (page * page_size) + page_size
        else:
            # Estimate for large tables without executing count
            total = (page * page_size) + page_size

        # Apply sorting
        sort_col = None
        if sort_by is not None:
            # Find column by name
            sort_col = next((col for col in table.columns if col.name.lower() == sort_by.lower()), None)

        if sort_col is not None:
            query = query.order_by(desc(sort_col) if sort_desc else asc(sort_col))
        else:
            # Default sort by first column
            query = query.order_by(asc(table.columns[0]))

        # Apply pagination
        if page > 1:
            query = query.offset((page - 1) * page_size)
        if page_size > 0:
            query = query.limit(page_size)

        # Execute query with performance optimizations
        try:
            # Use execution options to optimize performance
            result = db.execute(query.execution_options(
                stream_results=True,
                max_row_buffer=page_size,
                timeout=30  # Set higher timeout for complex queries
            ))
            rows = result.fetchall()
        except Exception as e:
            print(f"Query execution error: {str(e)}")
            print(traceback.format_exc())
            return [], 0

        # Convert to list of dictionaries with optimized approach
        data = []
        for row in rows:
            # Convert to dictionary
            row_dict = {}
            for key in row._mapping.keys():
                value = row._mapping[key]
                key_str = str(key)

                # Handle non-JSON serializable types
                if value is not None:
                    if isinstance(value, (str, int, float, bool, type(None))):
                        row_dict[key_str] = value
                    else:
                        # Convert complex types to string
                        row_dict[key_str] = str(value)
                else:
                    row_dict[key_str] = None

            data.append(row_dict)

        # Cache the result
        result = (data, total)
        # Cache for 5 minutes, or less if searching (search results may change more frequently)
        ttl = 60 if search else 300
        memory_cache.set(cache_key, result, ttl)

        elapsed = time.time() - start_time
        print(f"Query executed in {elapsed:.2f}s, returned {len(data)} rows of {total} total")

        return result

    except Exception as e:
        elapsed = time.time() - start_time
        print(f"Error in get_direct_table_data after {elapsed:.2f}s: {str(e)}")
        print(traceback.format_exc())
        return [], 0


def update_direct_table_row(db: Session, table_name: str, primary_key_col: str, row_id: Any,
                            row_data: Dict[str, Any]) -> bool:
    """Update a row directly in an existing PostgreSQL table with optimized performance"""
    start_time = time.time()

    # Invalidate any related caches for this table
    try:
        # Delete all cache keys related to this table
        pattern = f"taitur:direct_data:{table_name}_*"
        keys = memory_cache.keys(pattern)
        for key in keys:
            memory_cache.delete(key)
        print(f"Cleared {len(keys)} cache entries for table {table_name}")

        # Also clear the cache for the specific row
        row_key = f"taitur:row:{table_name}:{row_id}"
        memory_cache.delete(row_key)
    except Exception as e:
        print(f"Cache invalidation error: {str(e)}")

    try:
        # Create dynamic table object
        metadata = MetaData()
        table = Table(table_name, metadata, autoload_with=db.bind)

        # Find primary key column
        pk_col = next((col for col in table.columns if col.name == primary_key_col), None)

        if pk_col is None:
            print(f"Primary key column '{primary_key_col}' not found in table '{table_name}'")
            return False

        # Build update values
        update_values = {}
        for col_name, value in row_data.items():
            if col_name == primary_key_col:
                continue

            # Check if column exists
            col = next((c for c in table.columns if c.name == col_name), None)
            if col is not None:
                update_values[col] = value

        if not update_values:
            print(f"No valid columns to update in table '{table_name}'")
            return False

        # Execute update with optimized approach
        stmt = table.update().where(pk_col == row_id).values(update_values)
        result = db.execute(stmt)
        db.commit()

        elapsed = time.time() - start_time
        print(f"Update executed in {elapsed:.2f}s, updated {result.rowcount} rows")

        return result.rowcount > 0

    except Exception as e:
        elapsed = time.time() - start_time
        print(f"Error in update_direct_table_row after {elapsed:.2f}s: {str(e)}")
        print(traceback.format_exc())
        db.rollback()
        return False


def get_table_stats(db: Session, table_name: str) -> Dict[str, Any]:
    """Get statistics about the table to improve search and display"""
    cache_key = f"taitur:table_stats:{table_name}"

    # Try to get from cache
    cached_data = memory_cache.get(cache_key)
    if cached_data:
        return cached_data

    try:
        # Create dynamic table object
        metadata = MetaData()
        table = Table(table_name, metadata, autoload_with=db.bind)

        # Get column statistics
        column_stats = {}

        # Dangerous to run this on large tables, so we'll be selective
        # Just get info about table structure
        column_stats = {
            col.name: {
                "type": str(col.type),
                "primary_key": col.primary_key,
                "nullable": col.nullable
            } for col in table.columns
        }

        # Get row count estimate
        count_query = text(f"""
            SELECT reltuples::bigint AS estimate
            FROM pg_class
            WHERE relname = :table_name
        """)

        row_count_estimate = db.execute(count_query, {"table_name": table_name}).scalar() or 0

        stats = {
            "column_stats": column_stats,
            "row_count_estimate": row_count_estimate,
            "generated_at": time.time()
        }

        # Cache the result (longer TTL since table stats don't change often)
        memory_cache.set(cache_key, stats, 3600)  # Cache for 1 hour

        return stats

    except Exception as e:
        print(f"Error getting table stats: {str(e)}")
        print(traceback.format_exc())
        return {
            "column_stats": {},
            "row_count_estimate": 0,
            "error": str(e)
        }