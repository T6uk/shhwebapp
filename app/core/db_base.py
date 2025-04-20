# app/core/db_base.py
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import MetaData

# Create base classes
Base = declarative_base()
UserBase = declarative_base()  # Separate base for user models
UserMetadata = MetaData()