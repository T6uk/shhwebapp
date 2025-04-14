# app/models/change_log.py
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from app.core.user_db import UserBase as Base

class ChangeLog(Base):
    __tablename__ = "change_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    username = Column(String, nullable=False)  # Denormalized for easier reporting
    table_name = Column(String, nullable=False)
    row_id = Column(String, nullable=False)
    column_name = Column(String, nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    changed_at = Column(DateTime, default=func.now())
    client_ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)