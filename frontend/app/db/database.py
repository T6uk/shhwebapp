from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import inspect, MetaData, Table, Column, Integer, create_engine
from sqlalchemy.dialects.postgresql import *
import os
from dotenv import load_dotenv
import logging
from app.db.models import AutomapBase

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Database connection strings
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:1234@127.20.10.11/accessdb")
# We need a sync engine for reflection and a separate async engine for operations
SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")

# Create engines
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=300
)

# Create a synchronous engine for reflection
sync_engine = create_engine(SYNC_DATABASE_URL, echo=False)

# Session factory
AsyncSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)


# Dynamic model mapping
def initialize_models():
    """Reflect the database and map models"""
    try:
        logger.info("Initializing database models...")

        # Reflect all tables from database
        metadata = MetaData()
        metadata.reflect(bind=sync_engine)

        # Update AutomapBase metadata with reflected tables
        AutomapBase.metadata = metadata

        # Generate ORM classes
        AutomapBase.prepare()

        # Log discovered models
        for cls_name, cls in AutomapBase.classes.items():
            logger.info(f"Mapped model: {cls_name}")

            # Log columns for each model
            columns = [column.name for column in cls.__table__.columns]
            logger.info(f"Columns for {cls_name}: {', '.join(columns[:5])}... ({len(columns)} total)")

        return True
    except Exception as e:
        logger.error(f"Error initializing models: {e}")
        return False


async def get_db():
    """Dependency for getting async database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


def get_table_info():
    """Get information about all tables in the database"""
    inspector = inspect(sync_engine)
    tables = {}

    for table_name in inspector.get_table_names():
        column_info = []
        for column in inspector.get_columns(table_name):
            column_info.append({
                "name": column["name"],
                "type": str(column["type"]),
                "nullable": column["nullable"],
                "default": str(column["default"]) if column["default"] else None,
                "primary_key": column.get("primary_key", False)
            })

        pk_columns = inspector.get_pk_constraint(table_name).get("constrained_columns", [])
        fk_info = []
        for fk in inspector.get_foreign_keys(table_name):
            fk_info.append({
                "columns": fk["constrained_columns"],
                "referred_table": fk["referred_table"],
                "referred_columns": fk["referred_columns"]
            })

        tables[table_name] = {
            "columns": column_info,
            "primary_key": pk_columns,
            "foreign_keys": fk_info
        }

    return tables


def get_model_from_table_name(table_name):
    """Get the ORM model for a given table name"""
    for cls_name, cls in AutomapBase.classes.items():
        if cls.__table__.name == table_name:
            return cls
    return None


# Initialize models on module import
initialize_models()