import json
from redis import asyncio as aioredis
from app.core.config import settings

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
    await redis_client.set(key, json.dumps(value), ex=expire)

async def get_cache(key: str):
    """Get a cached value by key"""
    data = await redis_client.get(key)
    if data:
        return json.loads(data)
    return None

async def invalidate_cache(key_pattern: str):
    """Delete all cache keys matching a pattern"""
    keys = await redis_client.keys(key_pattern)
    if keys:
        await redis_client.delete(*keys)