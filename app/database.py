from sqlalchemy import create_engine, inspect, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool
import redis
import json
import pickle
from functools import wraps
from app.config import settings

# Create SQLAlchemy engine with optimized connection pooling
engine = create_engine(
    settings.computed_database_url,
    pool_size=20,  # Increased from default
    max_overflow=40,  # Allow more connections under heavy load
    pool_timeout=30,  # Wait longer for a connection if needed
    pool_pre_ping=True,  # Verify connections before using them
    pool_recycle=3600,  # Recycle connections after an hour
    poolclass=QueuePool,  # Explicit queue pool for better performance
    connect_args={"application_name": "taitur_webapp"}  # Help with PostgreSQL monitoring
)


# Set up listeners to optimize connection performance
@event.listens_for(engine, "connect")
def set_pg_settings(dbapi_connection, connection_record):
    # Set PostgreSQL session parameters for better performance with large datasets
    cursor = dbapi_connection.cursor()
    cursor.execute("SET work_mem = '32MB'")  # More memory for sorting/joining
    cursor.execute("SET maintenance_work_mem = '256MB'")  # For maintenance tasks
    cursor.execute("SET random_page_cost = 1.1")  # Assume fast disk access
    cursor.execute("SET effective_cache_size = '4GB'")  # Assume more system cache
    cursor.close()


# Create session factory with optimized settings
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False  # Improve performance by avoiding unnecessary reloads
)

# Redis client for caching
try:
    redis_client = redis.Redis(
        host=settings.REDIS_HOST if hasattr(settings, 'REDIS_HOST') else 'localhost',
        port=settings.REDIS_PORT if hasattr(settings, 'REDIS_PORT') else 6379,
        db=settings.REDIS_DB if hasattr(settings, 'REDIS_DB') else 0,
        socket_timeout=5,
        decode_responses=False  # We'll handle serialization ourselves
    )
    REDIS_AVAILABLE = True
except:
    REDIS_AVAILABLE = False
    redis_client = None

# Base class for models
Base = declarative_base()


# Cache decorator for database queries
def cache_query(ttl=300):
    """Cache results of database queries in Redis"""

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if not REDIS_AVAILABLE:
                return func(*args, **kwargs)

            # Create a cache key from function name and arguments
            key_parts = [func.__name__]
            for arg in args[1:]:  # Skip 'self' or 'db' argument
                key_parts.append(str(arg))
            for k, v in kwargs.items():
                key_parts.append(f"{k}={v}")

            cache_key = f"taitur:cache:{'_'.join(key_parts)}"

            # Try to get from cache
            cached = redis_client.get(cache_key)
            if cached:
                try:
                    return pickle.loads(cached)
                except:
                    pass  # If deserialization fails, execute the query

            # Execute the query
            result = func(*args, **kwargs)

            # Cache the result
            try:
                redis_client.setex(cache_key, ttl, pickle.dumps(result))
            except:
                pass  # If caching fails, just return the result

            return result

        return wrapper

    return decorator


# Check and create performance-optimized indexes
def ensure_indexes():
    """Ensure indexes exist for better query performance"""
    from sqlalchemy import Index, text
    from app.models.data_models import DataTable

    try:
        # Add GIN index on JSONB data field for fast search
        Index('idx_data_table_data_gin', DataTable.data, postgresql_using='gin').create(engine)
    except:
        # Index might already exist
        pass

    # Create custom indexes for frequently accessed fields in taitur_data
    common_fields = ['id', 'võlgnik', 'toimiku_nr', 'staatus', 'nõude_suurus', 'võlgniku_reg_isikukood']

    with engine.connect() as conn:
        for field in common_fields:
            try:
                conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_taitur_{field} ON taitur_data(({field}))"))
            except:
                pass  # If index creation fails, continue


# Initialize database and create optimized indexes
def init_db():
    # Import models to ensure they're registered with Base
    from app.models.data_models import DataTable, TableSchema
    Base.metadata.create_all(bind=engine)
    print("Database tables created.")

    # Create optimized indexes
    ensure_indexes()
    print("Database indexes optimized.")


# Dependency for API endpoints
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()