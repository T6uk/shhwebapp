# app/database.py
from sqlalchemy import create_engine, inspect, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool
import threading
import time
from functools import wraps
from app.config import settings
import pickle
from typing import Dict, Any, Tuple

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


# In-memory cache implementation
class MemoryCache:
    def __init__(self):
        self.cache: Dict[str, Tuple[Any, float]] = {}
        self.lock = threading.RLock()

        # Start a background thread to clean expired entries
        self.cleanup_thread = threading.Thread(target=self._cleanup_expired, daemon=True)
        self.cleanup_thread.start()

    def get(self, key):
        with self.lock:
            if key in self.cache:
                value, expiry = self.cache[key]
                if expiry > time.time():
                    return value
                # Remove expired
                del self.cache[key]
        return None

    def set(self, key, value, ttl=300):
        with self.lock:
            expiry = time.time() + ttl
            self.cache[key] = (value, expiry)

    def delete(self, key):
        with self.lock:
            if key in self.cache:
                del self.cache[key]

    def keys(self, pattern='*'):
        """Simple pattern matching for cache keys"""
        with self.lock:
            if pattern == '*':
                return list(self.cache.keys())

            # Simple wildcard implementation
            if pattern.endswith('*'):
                prefix = pattern[:-1]
                return [k for k in self.cache.keys() if k.startswith(prefix)]

            return [k for k in self.cache.keys() if pattern in k]

    def _cleanup_expired(self):
        """Background thread to clean expired cache entries"""
        while True:
            time.sleep(60)  # Check every minute
            current_time = time.time()
            with self.lock:
                # Find expired keys
                expired_keys = [
                    k for k, (_, exp) in self.cache.items()
                    if exp <= current_time
                ]
                # Remove expired keys
                for k in expired_keys:
                    del self.cache[k]


# Create a singleton instance of the memory cache
memory_cache = MemoryCache()

# Base class for models
Base = declarative_base()


# Cache decorator for database queries
def cache_query(ttl=300):
    """Cache results of database queries in memory"""

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Create a cache key from function name and arguments
            key_parts = [func.__name__]
            for arg in args[1:]:  # Skip 'self' or 'db' argument
                key_parts.append(str(arg))
            for k, v in kwargs.items():
                key_parts.append(f"{k}={v}")

            cache_key = f"taitur:cache:{'_'.join(key_parts)}"

            # Try to get from cache
            cached = memory_cache.get(cache_key)
            if cached:
                return cached

            # Execute the query
            result = func(*args, **kwargs)

            # Cache the result
            memory_cache.set(cache_key, result, ttl)

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