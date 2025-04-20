# app/core/cache.py
import orjson
from redis import asyncio as aioredis
from redis.asyncio.connection import ConnectionPool
from redis.asyncio.client import Redis
from app.core.config import settings
import hashlib
import logging
from typing import Any, Optional, Dict, List, Union
from functools import wraps
import asyncio
import inspect
import time
from datetime import timedelta

# Set up logging
logger = logging.getLogger(__name__)

# Global Redis connection pool and client
redis_pool: Optional[ConnectionPool] = None
redis_client: Optional[Redis] = None


async def init_redis_pool() -> Redis:
    """Initialize Redis connection pool with optimized settings"""
    global redis_pool, redis_client

    if redis_client is not None:
        return redis_client

    try:
        # Create connection pool with optimized settings
        redis_pool = aioredis.ConnectionPool.from_url(
            settings.REDIS_CONNECTION_STRING,
            max_connections=20,  # Limit maximum connections
            decode_responses=True,  # Auto-decode to strings
            encoding="utf-8",
            retry_on_timeout=True,  # Auto-retry on timeout
            socket_timeout=2.0,  # Socket timeout (seconds)
            socket_connect_timeout=2.0,  # Connection timeout
            socket_keepalive=True,  # Keep connections alive
            health_check_interval=30  # Health check interval
        )

        # Create Redis client
        redis_client = Redis(connection_pool=redis_pool)

        # Test connection
        await redis_client.ping()
        logger.info("Redis connection established successfully")

        return redis_client
    except Exception as e:
        logger.error(f"Failed to initialize Redis connection: {str(e)}")
        # Return a dummy Redis client that doesn't do anything
        # This way the app can still function without Redis
        return DummyRedis()


async def get_redis() -> Redis:
    """Get Redis client instance with connection check"""
    global redis_client

    if redis_client is None:
        redis_client = await init_redis_pool()

    # Check if connection is still valid
    try:
        if not isinstance(redis_client, DummyRedis):
            await redis_client.ping()
    except Exception as e:
        logger.warning(f"Redis connection lost, reconnecting: {str(e)}")
        redis_client = await init_redis_pool()

    return redis_client


async def set_cache(key: str, value: Any, expire: int = None) -> bool:
    """Set a cache value with optimized serialization"""
    redis = await get_redis()
    if isinstance(redis, DummyRedis):
        return False

    try:
        # Use a consistent key format with a prefix
        cache_key = f"bigtable:{key}"

        # Determine expire time - use settings.REDIS_TTL as default if not provided
        if expire is None:
            expire = settings.REDIS_TTL

        # Convert to JSON using orjson for faster serialization
        json_value = orjson.dumps(value).decode('utf-8')

        # Set with expiration
        result = await redis.set(cache_key, json_value, ex=expire)

        if result:
            logger.debug(f"Cached key: {key} with TTL: {expire}s")
            return True
        return False
    except Exception as e:
        logger.error(f"Error setting cache: {str(e)}")
        return False


async def get_cache(key: str) -> Optional[Any]:
    """Get a cached value by key with optimized error handling"""
    redis = await get_redis()
    if isinstance(redis, DummyRedis):
        return None

    try:
        cache_key = f"bigtable:{key}"
        data = await redis.get(cache_key)

        if data:
            try:
                return orjson.loads(data)
            except orjson.JSONDecodeError as e:
                logger.error(f"Error decoding cached JSON for {key}: {str(e)}")
                # If JSON decoding fails, return raw data as fallback
                return data
        return None
    except Exception as e:
        logger.error(f"Error getting cache: {str(e)}")
        return None


async def invalidate_cache(key_pattern: str) -> int:
    """Delete all cache keys matching a pattern and return count of deleted keys"""
    redis = await get_redis()
    if isinstance(redis, DummyRedis):
        return 0

    try:
        pattern = f"bigtable:{key_pattern}"
        keys = await redis.keys(pattern)

        if keys:
            deleted = await redis.delete(*keys)
            logger.info(f"Invalidated {deleted} cache keys matching: {key_pattern}")
            return deleted
        return 0
    except Exception as e:
        logger.error(f"Error invalidating cache: {str(e)}")
        return 0


async def compute_cache_key(params: dict) -> str:
    """Compute a deterministic cache key from params dict"""
    # Sort the params to ensure consistent ordering
    sorted_items = sorted(
        (str(k), str(v) if v is not None else "")
        for k, v in params.items()
    )

    # Create a string representation
    param_str = "&".join(f"{k}={v}" for k, v in sorted_items)

    # Create a hash of the string
    return hashlib.md5(param_str.encode()).hexdigest()


class DummyRedis:
    """Dummy Redis client that does nothing - used when Redis is unavailable"""

    async def ping(self):
        return False

    async def set(self, *args, **kwargs):
        return False

    async def get(self, *args, **kwargs):
        return None

    async def keys(self, *args, **kwargs):
        return []

    async def delete(self, *args, **kwargs):
        return 0

    async def publish(self, *args, **kwargs):
        return 0


# Cache decorator for easy function caching
def async_cache(ttl: int = None, key_prefix: str = None):
    """Decorator to cache results of async functions"""

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Create a cache key from function name and arguments
            func_name = func.__name__
            module_name = func.__module__

            # Create a unique prefix
            prefix = key_prefix or f"{module_name}.{func_name}"

            # Create a deterministic key from args and kwargs
            call_args = inspect.getcallargs(func, *args, **kwargs)

            # Remove 'self' or 'cls' if present
            if 'self' in call_args:
                del call_args['self']
            if 'cls' in call_args:
                del call_args['cls']

            # Get the cache key
            cache_key = f"{prefix}:{await compute_cache_key(call_args)}"

            # Try to get from cache
            cached_result = await get_cache(cache_key)
            if cached_result is not None:
                logger.debug(f"Cache hit for {cache_key}")
                return cached_result

            # Cache miss - execute function
            start_time = time.time()
            result = await func(*args, **kwargs)
            execution_time = time.time() - start_time

            # Cache the result
            if result is not None:
                await set_cache(cache_key, result, expire=ttl)
                logger.debug(f"Cached result of {func_name} ({execution_time:.3f}s) with key {cache_key}")

            return result

        return wrapper

    return decorator