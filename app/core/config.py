# app/core/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, List, Dict, Any
import os
import secrets
from pathlib import Path
import logging
from functools import lru_cache

# Configure logger
logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables with enhanced options"""
    # Application info
    PROJECT_NAME: str = "Suur Andmetabel"
    API_V1_STR: str = "/api/v1"
    VERSION: str = "1.0.0"
    DESCRIPTION: str = "Andmete haldamise rakendus"

    # Set base directory for data files
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    LOGS_DIR: Path = BASE_DIR / "logs"

    # Edit mode settings
    EDIT_MODE_PASSWORD: str = "EditData123!"  # Default edit mode password
    EDIT_MODE_ENABLE_NOTIFICATIONS: bool = True
    EDIT_MODE_CHECK_INTERVAL: int = 15  # seconds
    EDIT_MODE_LOG_CHANGES: bool = True

    # Database connection settings
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "1234"
    POSTGRES_HOST: str = "172.20.10.11"
    POSTGRES_PORT: str = "5432"
    POSTGRES_DB: str = "accessdb"
    DB_POOL_SIZE: int = 20  # Default connection pool size
    DB_MAX_OVERFLOW: int = 10  # Additional connections when pool is full
    DB_POOL_TIMEOUT: int = 30  # Seconds to wait for a connection from pool
    DB_ECHO: bool = False  # Don't log SQL in production

    # Custom database URLs (optional)
    DATABASE_URL: Optional[str] = None
    USER_DATABASE_URL: Optional[str] = None

    # User database
    USER_DB_FILE: str = "users.db"

    # Security settings
    SECRET_KEY: Optional[str] = None
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30  # 30 days
    COOKIE_SECURE: bool = False  # Set to True in production with HTTPS
    COOKIE_DOMAIN: Optional[str] = None  # Set to your domain in production

    # JWT settings
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRES: int = 60 * 24  # 1 day in minutes
    JWT_REFRESH_TOKEN_EXPIRES: int = 30 * 24 * 60  # 30 days in minutes

    # Password policy
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_REQUIRE_UPPERCASE: bool = True
    PASSWORD_REQUIRE_LOWERCASE: bool = True
    PASSWORD_REQUIRE_DIGIT: bool = True
    PASSWORD_REQUIRE_SPECIAL: bool = True

    # Account security
    MAX_LOGIN_ATTEMPTS: int = 5
    ACCOUNT_LOCKOUT_MINUTES: int = 15
    PASSWORD_RESET_TOKEN_EXPIRES_HOURS: int = 24

    # Default admin account - CHANGE IN PRODUCTION!
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "Admin123!"
    ADMIN_EMAIL: str = "admin@example.com"

    # Redis settings
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: Optional[str] = None
    REDIS_URL: Optional[str] = None
    REDIS_TTL: int = 3600  # Default TTL for cached items (1 hour)

    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    WORKERS: int = 4
    RELOAD: bool = False  # Set to True in development
    LOG_LEVEL: str = "warning"  # Use "debug" in development

    # CORS settings
    CORS_ORIGINS: List[str] = ["*"]
    CORS_ALLOW_CREDENTIALS: bool = True

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 60  # 60 requests per minute

    # Pagination settings
    DEFAULT_PAGE_SIZE: int = 100
    MAX_PAGE_SIZE: int = 1000

    # Email settings (optional)
    SMTP_SERVER: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: str = "noreply@andmetabel.ee"
    SMTP_TLS: bool = True

    # Feature flags
    ENABLE_WEBSOCKETS: bool = True
    ENABLE_SERVICE_WORKER: bool = True
    ENABLE_REDIS_CACHE: bool = True

    # Debug options
    DEBUG: bool = False
    PROFILE_QUERIES: bool = False  # Set to True to log query performance

    # Local database settings
    LOCAL_DB_PATH: Path = DATA_DIR / "local_data.db"
    USE_LOCAL_DB: bool = os.getenv("USE_LOCAL_DB", "false").lower() in ("true", "1", "yes")
    LOCAL_DB_TIMEOUT: int = 5  # Seconds before connection times out
    FALLBACK_TO_LOCAL: bool = True  # Whether to auto-fallback to local DB

    @property
    def SQLALCHEMY_LOCAL_DATABASE_URI(self) -> str:
        """Build SQLAlchemy database URI for SQLite local backup"""
        return f"sqlite:///{self.LOCAL_DB_PATH}"

    @property
    def SQLALCHEMY_ASYNC_LOCAL_DATABASE_URI(self) -> str:
        """Build async SQLAlchemy database URI for SQLite local backup"""
        return f"sqlite+aiosqlite:///{self.LOCAL_DB_PATH}"

    # Property getters
    @property
    def get_data_dir(self) -> Path:
        """Ensure data directory exists and return it"""
        if not self.DATA_DIR.exists():
            self.DATA_DIR.mkdir(parents=True)
        return self.DATA_DIR

    @property
    def get_logs_dir(self) -> Path:
        """Ensure logs directory exists and return it"""
        if not self.LOGS_DIR.exists():
            self.LOGS_DIR.mkdir(parents=True)
        return self.LOGS_DIR

    @property
    def USER_DB_PATH(self) -> Path:
        """Get the full path to the user database"""
        return self.get_data_dir / self.USER_DB_FILE

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        """Build SQLAlchemy database URI for asyncpg"""
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def SQLALCHEMY_USER_DATABASE_URI(self) -> str:
        """Build SQLAlchemy database URI for SQLite user DB"""
        if self.USER_DATABASE_URL:
            return self.USER_DATABASE_URL
        return f"sqlite:///{self.USER_DB_PATH}"

    @property
    def REDIS_CONNECTION_STRING(self) -> str:
        """Build Redis connection string"""
        if self.REDIS_URL:
            return self.REDIS_URL

        auth_part = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        return f"redis://{auth_part}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Ensure directories exist
        self.get_data_dir
        self.get_logs_dir
        # Ensure SECRET_KEY is initialized and persistent
        self._ensure_secret_key()

    def _ensure_secret_key(self):
        """Ensure a consistent SECRET_KEY exists, stored in a file"""
        # If SECRET_KEY is provided via environment or other means, use it
        if self.SECRET_KEY:
            logger.info("Using provided SECRET_KEY")
            return

        # Define path for secret key file
        secret_key_path = self.DATA_DIR / "secret_key.txt"

        # If file exists, load key from it
        if secret_key_path.exists():
            try:
                self.SECRET_KEY = secret_key_path.read_text().strip()
                logger.info("Loaded SECRET_KEY from file")
                return
            except Exception as e:
                logger.error(f"Failed to read SECRET_KEY from file: {e}")
                # Continue to key generation if file read fails

        # Generate a new key and save it
        self.SECRET_KEY = secrets.token_urlsafe(32)
        try:
            secret_key_path.write_text(self.SECRET_KEY)
            logger.info("Generated and saved new SECRET_KEY")
        except Exception as e:
            logger.error(f"Failed to save SECRET_KEY to file: {e}")
            # Continue with in-memory key even if file write fails

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        case_sensitive=True,
        extra="ignore"
    )


# Cache the settings instance
@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


# Create settings instance for import
settings = get_settings()