# app/core/db.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker
from sqlalchemy import inspect, create_engine
from asyncio import current_task
from contextlib import asynccontextmanager
import logging
from typing import AsyncGenerator

from app.core.config import settings
from app.models.table import metadata, BigTable
from app.core.db_base import Base, UserBase  # Updated import

logger = logging.getLogger(__name__)

# Enhanced engine configuration for better performance and connection handling
engine = create_async_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    echo=False,
    future=True,
    pool_size=settings.DB_POOL_SIZE,  # Configurable pool size
    max_overflow=settings.DB_MAX_OVERFLOW,  # Allow burst capacity
    pool_pre_ping=True,  # Check connection health before using
    pool_recycle=3600,  # Recycle connections every hour to prevent stale connections
    pool_timeout=30,  # Timeout for getting connections from pool
    pool_use_lifo=True,  # Last In, First Out - better for applications with spikes
    connect_args={
        "command_timeout": 10  # Timeout for commands to prevent hanging requests
    }
)

# Create sync engine for initializing admin user and schema introspection
sync_engine = create_engine(
    settings.SQLALCHEMY_DATABASE_URI.replace("+asyncpg", ""),
    echo=False,
    future=True,
    pool_pre_ping=True
)

# Create async session factory with more robust settings
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False
)


async def init_db() -> bool:
    """Initialize database connection and reflect table structure"""
    try:
        # Create tables for user authentication
        async with engine.begin() as conn:
            # Create user tables
            await conn.run_sync(lambda sync_conn: UserBase.metadata.create_all(sync_conn))

            # Reflect the table structure from the database
            await conn.run_sync(lambda sync_conn: metadata.reflect(
                bind=sync_conn,
                only=['taitur_data']  # Replace with your actual table name
            ))

        logger.info("Database initialization completed successfully")
        return True
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}", exc_info=True)
        raise


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting async database session with enhanced error handling"""
    session = async_session_factory()
    try:
        yield session
    except Exception as e:
        logger.error(f"Database session error: {str(e)}", exc_info=True)
        await session.rollback()
        raise
    finally:
        await session.close()


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for getting database session - useful for scripts"""
    session = async_session_factory()
    try:
        yield session
    except Exception as e:
        logger.error(f"Database context error: {str(e)}", exc_info=True)
        await session.rollback()
        raise
    finally:
        await session.close()


async def get_table_schema() -> dict:
    """Get the database schema information with column details"""
    try:
        async with engine.connect() as conn:
            # Get table schema information
            inspector = await conn.run_sync(inspect)
            columns = await conn.run_sync(lambda sync_conn: inspector.get_columns(BigTable.name))

            # Process column information
            schema = {
                "table_name": BigTable.name,
                "columns": [
                    {
                        "name": col["name"],
                        "type": str(col["type"]),
                        "nullable": col.get("nullable", True),
                        "default": col.get("default"),
                        "primary_key": col.get("primary_key", False)
                    }
                    for col in columns
                ]
            }

            return schema
    except Exception as e:
        logger.error(f"Error getting table schema: {str(e)}", exc_info=True)
        return {"error": str(e)}