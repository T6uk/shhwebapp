import os
from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache


class Settings(BaseSettings):
    PROJECT_NAME: str = "Taitur Data Viewer"
    API_V1_STR: str = "/api"

    POSTGRES_SERVER: str
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_PORT: str = "5432"

    DATABASE_URL: Optional[str] = None

    # Redis settings for caching
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: Optional[str] = None

    # Performance settings
    ENABLE_CACHING: bool = True
    SEARCH_CACHE_TTL: int = 60  # Seconds
    SCHEMA_CACHE_TTL: int = 3600  # 1 hour

    # Keep original PAGE_SIZE for backward compatibility
    PAGE_SIZE: int = 100

    # Additional pagination settings
    MAX_PAGE_SIZE: int = 1000

    # Compute the DATABASE_URL if not explicitly provided
    @property
    def computed_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings():
    """Get application settings with caching for performance"""
    return Settings()


settings = get_settings()