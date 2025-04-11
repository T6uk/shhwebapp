import os
from pydantic import BaseSettings
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class DatabaseSettings(BaseSettings):
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "1234")
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "127.20.10.11")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "accessdb")
    POSTGRES_SCHEMA: str = os.getenv("POSTGRES_SCHEMA", "public")

    # Connection pool settings
    POOL_SIZE: int = int(os.getenv("POOL_SIZE", "20"))
    MAX_OVERFLOW: int = int(os.getenv("MAX_OVERFLOW", "10"))
    POOL_TIMEOUT: int = int(os.getenv("POOL_TIMEOUT", "30"))
    POOL_RECYCLE: int = int(os.getenv("POOL_RECYCLE", "300"))

    @property
    def SQLALCHEMY_DATABASE_URL(self) -> str:
        """Generate SQLAlchemy connection string"""
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def SQLALCHEMY_SYNC_DATABASE_URL(self) -> str:
        """Generate synchronous SQLAlchemy connection string for reflection"""
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    class Config:
        env_file = ".env"
        case_sensitive = True


class AppSettings(BaseSettings):
    # App configuration
    APP_NAME: str = os.getenv("APP_NAME", "PostgreSQL Data Explorer")
    APP_VERSION: str = os.getenv("APP_VERSION", "1.0.0")
    DEBUG: bool = os.getenv("DEBUG", "False").lower() in ("true", "1", "t")

    # API settings
    API_PREFIX: str = os.getenv("API_PREFIX", "/api")
    ALLOW_ORIGINS: List[str] = os.getenv("ALLOW_ORIGINS", "*").split(",")

    # Pagination defaults
    DEFAULT_PAGE_SIZE: int = int(os.getenv("DEFAULT_PAGE_SIZE", "100"))
    MAX_PAGE_SIZE: int = int(os.getenv("MAX_PAGE_SIZE", "1000"))

    # Performance settings
    ENABLE_GZIP: bool = os.getenv("ENABLE_GZIP", "True").lower() in ("true", "1", "t")
    CACHE_TIMEOUT: int = int(os.getenv("CACHE_TIMEOUT", "300"))  # 5 minutes

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    class Config:
        env_file = ".env"
        case_sensitive = True


class Settings(BaseSettings):
    """Main settings class that combines all settings"""
    db: DatabaseSettings = DatabaseSettings()
    app: AppSettings = AppSettings()


# Create a global settings instance
settings = Settings()