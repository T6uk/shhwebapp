import json
from redis import asyncio as aioredis
from app.core.config import settings
import hashlib

# Global Redis client
redis_client = None


async def init_redis_pool():
    """Initialize Redis connection pool"""
    global redis_client
    redis_client = await aioredis.from_url(
        settings.REDIS_CONNECTION_STRING,
        encoding="utf-8",
        decode_responses=True
    )
    return redis_client


async def get_redis():
    """Get Redis client instance"""
    return redis_client


async def set_cache(key: str, value, expire: int = 3600):
    """Set a cache value with expiration time"""
    # Use a consistent key format with a prefix
    cache_key = f"bigtable:{key}"

    # Convert to JSON
    json_value = json.dumps(value)
    await redis_client.set(cache_key, json_value, ex=expire)


async def get_cache(key: str):
    """Get a cached value by key"""
    cache_key = f"bigtable:{key}"

    try:
        data = await redis_client.get(cache_key)
        if data:
            return json.loads(data)
    except (json.JSONDecodeError, TypeError):
        pass

    return None


async def invalidate_cache(key_pattern: str):
    """Delete all cache keys matching a pattern"""
    pattern = f"bigtable:{key_pattern}"
    keys = await redis_client.keys(pattern)
    if keys:
        await redis_client.delete(*keys)


async def compute_cache_key(params: dict) -> str:
    """Compute a deterministic cache key from params dict"""
    # Sort the params to ensure consistent ordering
    sorted_items = sorted(params.items())

    # Create a string representation
    param_str = "&".join(f"{k}={v}" for k, v in sorted_items)

    # Create a hash of the string
    return hashlib.md5(param_str.encode()).hexdigest()