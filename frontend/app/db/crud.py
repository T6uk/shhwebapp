from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, Table, MetaData, Column, inspect
from sqlalchemy.sql import or_, and_
from typing import Dict, List, Tuple, Optional, Any
from app.db.database import get_model_from_table_name, get_table_info
import logging
import json

# Configure logging
logger = logging.getLogger(__name__)


async def get_tables(db: AsyncSession) -> List[str]:
    """Get list of all tables in the database"""
    query = text("""
        SELECT 
            table_name 
        FROM 
            information_schema.tables
        WHERE 
            table_schema = 'public'
        ORDER BY 
            table_name
    """)

    result = await db.execute(query)
    tables = result.scalars().all()

    return list(tables)


async def get_columns(db: AsyncSession, table_name: str = None) -> List[Dict[str, Any]]:
    """
    Get all column names and types from the specified table
    If no table specified, gets columns from all tables
    """
    if table_name:
        query = text("""
            SELECT 
                column_name, 
                data_type,
                is_nullable = 'YES' as is_nullable,
                column_default,
                ordinal_position
            FROM 
                information_schema.columns
            WHERE 
                table_name = :table_name
                AND table_schema = 'public'
            ORDER BY 
                ordinal_position
        """)

        result = await db.execute(query, {"table_name": table_name})
    else:
        # Default to the first table if none specified
        tables = await get_tables(db)
        if not tables:
            return []

        query = text("""
            SELECT 
                column_name, 
                data_type,
                is_nullable = 'YES' as is_nullable,
                column_default,
                ordinal_position
            FROM 
                information_schema.columns
            WHERE 
                table_name = :table_name
                AND table_schema = 'public'
            ORDER BY 
                ordinal_position
        """)

        result = await db.execute(query, {"table_name": tables[0]})

    columns = result.fetchall()

    return [
        {
            "name": col.column_name,
            "type": col.data_type,
            "nullable": col.is_nullable,
            "default": col.column_default,
            "position": col.ordinal_position
        }
        for col in columns
    ]


async def get_primary_keys(db: AsyncSession, table_name: str) -> List[str]:
    """Get primary key columns for a table"""
    query = text("""
        SELECT
            kcu.column_name
        FROM
            information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
        WHERE
            tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_name = :table_name
            AND tc.table_schema = 'public'
        ORDER BY
            kcu.ordinal_position
    """)

    result = await db.execute(query, {"table_name": table_name})
    primary_keys = result.scalars().all()

    return list(primary_keys)


async def get_table_row_count(db: AsyncSession, table_name: str) -> int:
    """Get the number of rows in a table"""
    query = text(f"SELECT COUNT(*) FROM {table_name}")
    result = await db.execute(query)
    count = result.scalar()

    return count


async def get_data(
        db: AsyncSession,
        table_name: str,
        skip: int = 0,
        limit: int = 100,
        sort_column: Optional[str] = None,
        sort_direction: str = "asc",
        filters: Optional[Dict[str, Any]] = None,
        search: Optional[str] = None,
        columns: Optional[List[str]] = None
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Get data with pagination, sorting, filtering and search
    Returns (data_list, total_count)
    """
    model = get_model_from_table_name(table_name)

    if not model:
        logger.error(f"Model not found for table: {table_name}")
        return [], 0

    # Build base query
    if columns:
        # Select only specified columns
        select_columns = [getattr(model, col) for col in columns if hasattr(model, col)]
        query = select(*select_columns)
    else:
        # Select all columns
        query = select(model)

    # Add from_obj
    query = query.select_from(model)

    # Build filter conditions
    filter_conditions = []

    # Apply filters
    if filters:
        for column, value in filters.items():
            if hasattr(model, column):
                col = getattr(model, column)

                # Handle different filter types (exact, contains, etc.)
                if isinstance(value, dict):
                    operation = value.get("op", "eq")
                    filter_value = value.get("value")

                    if operation == "eq":
                        filter_conditions.append(col == filter_value)
                    elif operation == "neq":
                        filter_conditions.append(col != filter_value)
                    elif operation == "gt":
                        filter_conditions.append(col > filter_value)
                    elif operation == "lt":
                        filter_conditions.append(col < filter_value)
                    elif operation == "gte":
                        filter_conditions.append(col >= filter_value)
                    elif operation == "lte":
                        filter_conditions.append(col <= filter_value)
                    elif operation == "contains":
                        filter_conditions.append(col.ilike(f"%{filter_value}%"))
                    elif operation == "startswith":
                        filter_conditions.append(col.ilike(f"{filter_value}%"))
                    elif operation == "endswith":
                        filter_conditions.append(col.ilike(f"%{filter_value}"))
                    elif operation == "in":
                        if isinstance(filter_value, list):
                            filter_conditions.append(col.in_(filter_value))
                    elif operation == "not_in":
                        if isinstance(filter_value, list):
                            filter_conditions.append(~col.in_(filter_value))
                    elif operation == "between":
                        if isinstance(filter_value, list) and len(filter_value) == 2:
                            filter_conditions.append(col.between(filter_value[0], filter_value[1]))
                    elif operation == "is_null":
                        if filter_value:
                            filter_conditions.append(col.is_(None))
                        else:
                            filter_conditions.append(col.isnot(None))
                else:
                    # Simple equality
                    filter_conditions.append(col == value)

    # Apply search
    if search:
        search_conditions = []

        # Apply search to string columns
        for column_name in [c.name for c in model.__table__.columns]:
            column = getattr(model, column_name)
            # Only apply search to string-like columns
            column_type = str(model.__table__.columns[column_name].type)
            if 'CHAR' in column_type.upper() or 'TEXT' in column_type.upper() or 'VARCHAR' in column_type.upper():
                search_conditions.append(column.ilike(f"%{search}%"))

        if search_conditions:
            filter_conditions.append(or_(*search_conditions))

    # Apply all filters
    if filter_conditions:
        query = query.where(and_(*filter_conditions))

    # Get total count (without pagination)
    count_query = select(func.count()).select_from(query.subquery())
    total_count = await db.scalar(count_query)

    # Apply sorting
    if sort_column and hasattr(model, sort_column):
        column = getattr(model, sort_column)
        if sort_direction.lower() == "desc":
            query = query.order_by(column.desc())
        else:
            query = query.order_by(column.asc())
    else:
        # Get primary key columns
        pk_cols = await get_primary_keys(db, table_name)
        if pk_cols:
            # Sort by first primary key
            if hasattr(model, pk_cols[0]):
                query = query.order_by(getattr(model, pk_cols[0]))

    # Apply pagination
    query = query.offset(skip).limit(limit)

    # Execute query
    try:
        result = await db.execute(query)

        if columns:
            # Convert to dictionaries keeping only selected columns
            rows = result.fetchall()
            data = [dict(zip(columns, row)) for row in rows]
        else:
            # Convert to dictionaries with all columns
            rows = result.scalars().all()
            data = [row.to_dict() if hasattr(row, 'to_dict') else {c.name: getattr(row, c.name) for c in
                                                                   model.__table__.columns} for row in rows]

        return data, total_count

    except Exception as e:
        logger.error(f"Error executing query: {e}")
        return [], 0


async def execute_raw_query(db: AsyncSession, query: str, params: Dict = None) -> List[Dict]:
    """
    Execute a raw SQL query
    Warning: This should be used carefully to avoid SQL injection
    """
    try:
        result = await db.execute(text(query), params or {})
        rows = result.fetchall()

        if not rows:
            return []

        # Convert to list of dicts
        columns = result.keys()
        return [dict(zip(columns, row)) for row in rows]

    except Exception as e:
        logger.error(f"Error executing raw query: {e}")
        return []