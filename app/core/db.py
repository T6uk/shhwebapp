from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import inspect
from app.core.config import settings
from app.models.table import metadata, BigTable

# Create async engine for PostgreSQL
engine = create_async_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    echo=False,
    future=True,
    pool_size=20,
    pool_pre_ping=True,
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
    # Reflect the table structure from the database
    async with engine.begin() as conn:
        # This will update the BigTable object with column information
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