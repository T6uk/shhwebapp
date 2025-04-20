# app/models/column_settings.py
from sqlalchemy import Column, Integer, String, Boolean
from app.core.db_base import UserBase as Base

class ColumnSetting(Base):
    __tablename__ = "column_settings"

    id = Column(Integer, primary_key=True, index=True)
    column_name = Column(String, nullable=False, index=True, unique=True)
    is_editable = Column(Boolean, default=False)
    display_name = Column(String, nullable=True)  # For nice display in admin UI