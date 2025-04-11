from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.database import Base


class DataTable(Base):
    """
    This is a generic model that can store any table from your database.
    In a real application, you'd create specific models for each table with proper columns.
    """
    __tablename__ = "data_table"

    id = Column(Integer, primary_key=True, index=True)

    # Metadata about this table
    table_name = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Store the actual row data as JSON
    # This allows us to handle the 250+ columns flexibly
    data = Column(JSONB, nullable=False)

    # You could add relationships to other tables if needed
    # related_tables = relationship("RelatedTable", back_populates="data_table")


class TableSchema(Base):
    """
    This model stores metadata about columns in each table,
    which will help with dynamic table rendering and validation.
    """
    __tablename__ = "table_schema"

    id = Column(Integer, primary_key=True, index=True)
    table_name = Column(String, nullable=False, index=True)
    column_name = Column(String, nullable=False)
    column_type = Column(String, nullable=False)  # e.g. "string", "integer", "date", etc.
    is_required = Column(Boolean, default=False)
    default_value = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    display_order = Column(Integer, default=0)  # For controlling column order in UI
    is_visible = Column(Boolean, default=True)  # Whether to show in UI by default

    # Validation rules (optional)
    min_value = Column(String, nullable=True)
    max_value = Column(String, nullable=True)
    pattern = Column(String, nullable=True)  # Regex pattern for validation