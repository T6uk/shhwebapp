
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Tuple, Optional
import json

from app.models.data_models import DataTable, TableSchema


def get_table_columns(db: Session, table_name: str) -> List[Dict[str, Any]]:
    """Get column definitions for a specific table"""
    columns = db.query(TableSchema).filter(
        TableSchema.table_name == table_name
    ).order_by(TableSchema.display_order).all()

    return [
        {
            "name": col.column_name,
            "type": col.column_type,
            "required": col.is_required,
            "default": col.default_value,
            "description": col.description,
            "visible": col.is_visible,
        }
        for col in columns
    ]


def get_table_data(
        db: Session,
        table_name: str,
        page: int = 1,
        page_size: int = 100,
        search: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_desc: bool = False
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Get paginated data from a table with support for searching and sorting
    Returns tuple of (data, total_count)
    """
    query = db.query(DataTable).filter(DataTable.table_name == table_name)

    # Apply search if provided
    if search:
        # Note: This is a simple implementation. In PostgreSQL, you can use
        # more advanced full-text search capabilities for better performance
        query = query.filter(
            text("data::text ILIKE :search").bindparams(search=f"%{search}%")
        )

    # Get total count before pagination
    total = query.count()

    # Apply sorting if provided
    if sort_by:
        # Using PostgreSQL's JSONB operators for sorting
        sort_expr = text(f"data->'{sort_by}'")
        if sort_desc:
            sort_expr = sort_expr.desc()
        query = query.order_by(sort_expr)

    # Apply pagination
    query = query.offset((page - 1) * page_size).limit(page_size)

    # Execute query and format results
    results = query.all()
    data = [
        {
            "id": row.id,
            **row.data  # Unpack the JSONB data
        }
        for row in results
    ]

    return data, total


def update_table_row(db: Session, table_name: str, row_id: int, row_data: Dict[str, Any]) -> bool:
    """Update a row in a table"""
    row = db.query(DataTable).filter(
        DataTable.table_name == table_name,
        DataTable.id == row_id
    ).first()

    if not row:
        return False

    # Update the data
    row.data = row_data
    db.commit()

    return True


def import_from_json(db: Session, table_name: str, json_data: List[Dict[str, Any]]) -> int:
    """Import data from JSON into a table"""
    records = []
    for item in json_data:
        record = DataTable(
            table_name=table_name,
            data=item
        )
        records.append(record)

    db.bulk_save_objects(records)
    db.commit()

    return len(records)