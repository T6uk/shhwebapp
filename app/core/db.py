# app/core/db.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker
from sqlalchemy import inspect, create_engine, text
from asyncio import current_task
from contextlib import asynccontextmanager
import logging
from typing import AsyncGenerator, Tuple, Optional
import os
import time
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.models.table import metadata, BigTable
from app.core.db_base import Base, UserBase  # Updated import

logger = logging.getLogger(__name__)

# Initialize engines as None - they will be created during init_db
engine = None
sync_engine = None
async_session_factory = None
using_local_db = False


async def create_db_engine() -> Tuple[any, any]:
    """Create database engine with failover to local SQLite if PostgreSQL is unavailable"""
    global using_local_db

    # Check if we should use local DB directly (from environment variable)
    if settings.USE_LOCAL_DB:
        logger.info("Using local SQLite database as configured via environment variable")
        using_local_db = True
        sqlite_engine = create_async_engine(
            settings.SQLALCHEMY_ASYNC_LOCAL_DATABASE_URI,
            echo=False,
            future=True,
            connect_args={"check_same_thread": False}  # Needed for SQLite
        )

        sqlite_sync_engine = create_engine(
            settings.SQLALCHEMY_LOCAL_DATABASE_URI,
            echo=False,
            future=True,
            connect_args={"check_same_thread": False}  # Needed for SQLite
        )
        return sqlite_engine, sqlite_sync_engine

    # Try PostgreSQL first
    try:
        # Test connection to PostgreSQL with a timeout
        logger.info("Attempting to connect to PostgreSQL server...")
        start_time = time.time()

        postgres_engine = create_async_engine(
            settings.SQLALCHEMY_DATABASE_URI,
            echo=False,
            future=True,
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_pre_ping=True,
            pool_recycle=3600,
            pool_timeout=settings.LOCAL_DB_TIMEOUT,
            pool_use_lifo=True,
            connect_args={"command_timeout": settings.LOCAL_DB_TIMEOUT}
        )

        # Test the connection with a simple query
        async with postgres_engine.begin() as conn:
            await conn.execute(text("SELECT 1"))  # Simple test query

        # If we get here, PostgreSQL is working
        elapsed = time.time() - start_time
        logger.info(f"Successfully connected to PostgreSQL server in {elapsed:.2f}s")
        using_local_db = False

        # Create sync engine for PostgreSQL
        postgres_sync_engine = create_engine(
            settings.SQLALCHEMY_DATABASE_URI.replace("+asyncpg", ""),
            echo=False,
            future=True,
            pool_pre_ping=True
        )

        return postgres_engine, postgres_sync_engine

    except SQLAlchemyError as e:
        logger.warning(f"PostgreSQL connection failed: {str(e)}")

        # Don't fall back if auto-fallback is disabled
        if not settings.FALLBACK_TO_LOCAL:
            raise

        logger.info("Falling back to local SQLite database")

        # PostgreSQL failed, check if local DB exists
        local_db_path = settings.LOCAL_DB_PATH
        if not os.path.exists(local_db_path):
            logger.error(f"Local database not found at {local_db_path}")
            raise ValueError(f"Local database not found at {local_db_path} and PostgreSQL connection failed")

        # Create SQLite engines
        using_local_db = True
        sqlite_engine = create_async_engine(
            settings.SQLALCHEMY_ASYNC_LOCAL_DATABASE_URI,
            echo=False,
            future=True,
            connect_args={"check_same_thread": False}  # Needed for SQLite
        )

        sqlite_sync_engine = create_engine(
            settings.SQLALCHEMY_LOCAL_DATABASE_URI,
            echo=False,
            future=True,
            connect_args={"check_same_thread": False}  # Needed for SQLite
        )

        # Check if SQLite database exists and has the required table
        try:
            # Test SQLite connection
            sync_inspector = inspect(sqlite_sync_engine)
            tables = sync_inspector.get_table_names()

            if "taitur_data" not in tables:
                logger.error("Local SQLite database does not contain required table 'taitur_data'")
                raise ValueError("Local SQLite database missing required table 'taitur_data'")
            else:
                logger.info("Successfully connected to local SQLite database")

        except Exception as sqlite_err:
            logger.error(f"SQLite connection also failed: {str(sqlite_err)}")
            raise

        return sqlite_engine, sqlite_sync_engine


async def init_db() -> bool:
    """Initialize database connection and reflect table structure"""
    global engine, sync_engine, async_session_factory

    try:
        # Create engines with failover
        engine, sync_engine = await create_db_engine()

        # Create session factory
        async_session_factory = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False
        )

        # Create tables for user authentication
        async with engine.begin() as conn:
            # Create user tables
            await conn.run_sync(lambda sync_conn: UserBase.metadata.create_all(sync_conn))

            # Reflect the table structure from the database
            await conn.run_sync(lambda sync_conn: metadata.reflect(
                bind=sync_conn,
                only=['taitur_data']  # Replace with your actual table name
            ))

        logger.info(
            f"Database initialization completed successfully (using {'local SQLite' if using_local_db else 'PostgreSQL'})")
        return True
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}", exc_info=True)
        raise


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting async database session with enhanced error handling"""
    global async_session_factory

    # Ensure database is initialized
    if async_session_factory is None:
        await init_db()

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
    global async_session_factory

    # Ensure database is initialized
    if async_session_factory is None:
        await init_db()

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
        # Ensure engine is initialized
        if engine is None:
            await init_db()

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


def is_using_local_db() -> bool:
    """Return whether the application is currently using the local database"""
    return using_local_db