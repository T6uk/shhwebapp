from sqlalchemy import text, Table, MetaData, select, func, inspect, column, desc, asc, or_, and_
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Tuple, Optional
import json
import traceback


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

        return result.rowcount > 0

    except Exception as e:
        print(f"Error in update_direct_table_row: {str(e)}")
        print(traceback.format_exc())
        db.rollback()
        return False