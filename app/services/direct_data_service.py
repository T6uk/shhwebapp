from sqlalchemy import text, Table, MetaData, select, func, inspect, column, desc, asc, or_, and_
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Tuple, Optional
import json
import traceback
import time


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
    Query data directly from an existing PostgreSQL table.
    Returns tuple of (data, total_count)
    """
    start_time = time.time()
    try:
        # Create a dynamic table object
        metadata = MetaData()
        table = Table(table_name, metadata, autoload_with=db.bind)

        # Base query - SQLAlchemy 2.0 style
        query = select(table)

        # For performance with large tables, calculate count separately
        # and only when no search is applied
        count_query = None
        total = 0

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
                # When searching, we need an accurate count
                count_query = select(func.count()).select_from(table).where(search_filter)

        # Only get count if needed (for search or first page)
        if count_query is not None or page == 1:
            if count_query is None:
                count_query = select(func.count()).select_from(table)
            total_result = db.execute(count_query).scalar()
            total = total_result if total_result is not None else 0
        else:
            # For performance with large datasets, estimate the total if we're on later pages
            # This avoids an expensive COUNT(*) query on big tables
            total = (page * page_size) + page_size  # Reasonable estimate

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

        # Execute query with error handling and connection pool optimization
        try:
            # Use execution options to optimize performance
            result = db.execute(query.execution_options(
                stream_results=True,  # Stream results for lower memory usage
                max_row_buffer=page_size  # Limit row buffer size
            ))
            rows = result.fetchall()
        except Exception as e:
            print(f"SQL execution error: {str(e)}")
            print(traceback.format_exc())
            # Return empty result set
            return [], 0

        # Convert to list of dictionaries with performance optimizations
        data = []
        for row in rows:
            # Convert to dictionary, handling special types
            row_dict = {}
            # Handle the row mapping properly
            for key in row._mapping.keys():
                value = row._mapping[key]
                key_str = str(key)

                # Handle non-JSON serializable types - with optimized approach
                if value is not None:
                    # Type-based handling to avoid try/except in the hot path
                    if isinstance(value, (str, int, float, bool, type(None))):
                        # These types are directly JSON serializable
                        row_dict[key_str] = value
                    else:
                        # For complex types, convert to string
                        row_dict[key_str] = str(value)
                else:
                    row_dict[key_str] = None

            data.append(row_dict)

        elapsed = time.time() - start_time
        print(f"Query execution time: {elapsed:.2f}s, returned {len(data)} rows")

        return data, total

    except Exception as e:
        elapsed = time.time() - start_time
        print(f"Error in get_direct_table_data after {elapsed:.2f}s: {str(e)}")
        print(traceback.format_exc())
        # Return empty result on error
        return [], 0


def update_direct_table_row(db: Session, table_name: str, primary_key_col: str, row_id: Any,
                            row_data: Dict[str, Any]) -> bool:
    """Update a row directly in an existing PostgreSQL table"""
    start_time = time.time()
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

        elapsed = time.time() - start_time
        print(f"Update execution time: {elapsed:.2f}s, updated {result.rowcount} rows")

        return result.rowcount > 0

    except Exception as e:
        elapsed = time.time() - start_time
        print(f"Error in update_direct_table_row after {elapsed:.2f}s: {str(e)}")
        print(traceback.format_exc())
        db.rollback()
        return False