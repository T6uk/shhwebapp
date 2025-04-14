from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import inspect, create_engine
from app.core.config import settings
from app.models.table import metadata, BigTable
from app.models.user import Base as UserBase
import logging

logger = logging.getLogger(__name__)

# Create async engine for PostgreSQL
engine = create_async_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    echo=False,
    future=True,
    pool_size=20,
    pool_pre_ping=True,
)

# Create sync engine for initializing admin user
sync_engine = create_engine(
    settings.SQLALCHEMY_DATABASE_URI.replace("+asyncpg", ""),
    echo=False,
    future=True,
)

# Create async session factory
async_session = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def init_db():
    """Initialize database connection and reflect table structure"""
    # Create tables for user authentication
    async with engine.begin() as conn:
        # Create user tables
        await conn.run_sync(lambda sync_conn: UserBase.metadata.create_all(sync_conn))

        # Reflect the table structure from the database
        await conn.run_sync(lambda sync_conn: metadata.reflect(
            bind=sync_conn,
            only=['taitur_data']  # Replace with your actual table name
        ))

    # Now BigTable has all the correct columns from the database
    return True


async def get_db():
    """Dependency for getting async database session"""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_table_columns():
    """Get the actual column names from the database table"""
    return [column.name for column in BigTable.columns]