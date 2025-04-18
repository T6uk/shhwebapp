# app/models/data_change.py
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from app.core.db_base import UserBase as Base

class DataChange(Base):
    __tablename__ = "data_changes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    table_name = Column(String, nullable=False)
    row_id = Column(String, nullable=False)
    column_name = Column(String, nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    changed_at = Column(DateTime, default=func.now())
    session_id = Column(String, nullable=False)  # To group changes from the same session