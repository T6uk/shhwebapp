from sqlalchemy import create_engine, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.config import settings

# Create SQLAlchemy engine
engine = create_engine(settings.computed_database_url, pool_pre_ping=True)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

# Create tables if they don't exist
def init_db():
    # Import models to ensure they're registered with Base
    from app.models.data_models import DataTable, TableSchema
    Base.metadata.create_all(bind=engine)
    print("Database tables created.")

# Dependency for API endpoints
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
