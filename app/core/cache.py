# app/core/cache.py
import orjson
from redis import asyncio as aioredis
from app.core.config import settings
import hashlib
import logging
from typing import Any, Optional

# Set up logging
logger = logging.getLogger(__name__)

# Global Redis client
redis_client = None


async def init_redis_pool():
    """Initialize Redis connection pool"""
    global redis_client
    redis_client = await aioredis.from_url(
        settings.REDIS_CONNECTION_STRING,
        encoding="utf-8",
        decode_responses=True,
        socket_timeout=2.0,  # Add timeout to prevent hanging
        socket_connect_timeout=2.0,
        health_check_interval=30  # Check connection health periodically
    )
    return redis_client


async def get_redis():
    """Get Redis client instance"""
    if redis_client is None:
        await init_redis_pool()
    return redis_client


async def set_cache(key: str, value: Any, expire: int = 3600):
    """Set a cache value with expiration time"""
    if redis_client is None:
        logger.error("Redis client not initialized")
        return

    try:
        # Use a consistent key format with a prefix
        cache_key = f"bigtable:{key}"

        # Convert to JSON using orjson for performance
        json_value = orjson.dumps(value).decode('utf-8')
        await redis_client.set(cache_key, json_value, ex=expire)
        logger.debug(f"Cached key: {key} with TTL: {expire}s")
    except Exception as e:
        logger.error(f"Error setting cache: {str(e)}")


async def get_cache(key: str) -> Optional[Any]:
    """Get a cached value by key"""
    if redis_client is None:
        logger.error("Redis client not initialized")
        return None

    try:
        cache_key = f"bigtable:{key}"
        data = await redis_client.get(cache_key)
        if data:
            return orjson.loads(data)
    except (orjson.JSONDecodeError, TypeError) as e:
        logger.error(f"Error decoding cached value for {key}: {str(e)}")
    except Exception as e:
        logger.error(f"Error getting cache: {str(e)}")

    return None


async def invalidate_cache(key_pattern: str):
    """Delete all cache keys matching a pattern"""
    if redis_client is None:
        logger.error("Redis client not initialized")
        return

    try:
        pattern = f"bigtable:{key_pattern}"
        keys = await redis_client.keys(pattern)
        if keys:
            await redis_client.delete(*keys)
            logger.info(f"Invalidated {len(keys)} cache keys matching: {key_pattern}")
    except Exception as e:
        logger.error(f"Error invalidating cache: {str(e)}")


async def compute_cache_key(params: dict) -> str:
    """Compute a deterministic cache key from params dict"""
    # Sort the params to ensure consistent ordering
    sorted_items = sorted(params.items())

    # Create a string representation
    param_str = "&".join(f"{k}={v}" for k, v in sorted_items)

    # Create a hash of the string
    return hashlib.md5(param_str.encode()).hexdigest()