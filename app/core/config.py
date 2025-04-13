from pydantic_settings import BaseSettings
from typing import Optional
import os
import secrets


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    PROJECT_NAME: str = "Big Table App"
    API_V1_STR: str = "/api/v1"

    # Security
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # Default admin account
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "1234"  # Change this to a secure password

    # PostgreSQL settings
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "1234"
    POSTGRES_HOST: str = "172.20.10.11"
    POSTGRES_PORT: str = "5432"
    POSTGRES_DB: str = "accessdb"

    # Redis settings
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379

    # Custom database URL (optional, will be built from parts if not provided)
    DATABASE_URL: Optional[str] = None

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        """Build SQLAlchemy database URI for asyncpg"""
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # Custom Redis URL (optional, will be built from parts if not provided)
    REDIS_URL: Optional[str] = None

    @property
    def REDIS_CONNECTION_STRING(self) -> str:
        """Build Redis connection string"""
        if self.REDIS_URL:
            return self.REDIS_URL
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    # Pagination settings
    PAGE_SIZE: int = 100

    class Config:
        env_file = ".env"
        case_sensitive = True


# Create settings instance
settings = Settings()