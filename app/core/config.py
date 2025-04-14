# app/core/config.py
from pydantic_settings import BaseSettings
from typing import Optional
import os
import secrets
from pathlib import Path
import logging
from typing import Optional, List, ClassVar
from pydantic_settings import BaseSettings
import os
import secrets
from pathlib import Path
import logging

# Configure logger
logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    PROJECT_NAME: str = "Big Table App"
    API_V1_STR: str = "/api/v1"

    # Set base directory for data files
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"

    EDIT_MODE_PASSWORD: str = "EditData123!"  # Default edit mode password
    EDIT_MODE_ENABLE_NOTIFICATIONS: bool = True
    EDIT_MODE_CHECK_INTERVAL: int = 15  # seconds
    EDIT_MODE_LOG_CHANGES: bool = True

    # Ensure data directory exists
    @property
    def get_data_dir(self) -> Path:
        if not self.DATA_DIR.exists():
            self.DATA_DIR.mkdir(parents=True)
        return self.DATA_DIR

    # Security - modified to use persistent SECRET_KEY
    SECRET_KEY: Optional[str] = None
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30  # 30 days
    COOKIE_SECURE: bool = False  # Set to True in production with HTTPS

    # Password policy
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_REQUIRE_UPPERCASE: bool = True
    PASSWORD_REQUIRE_LOWERCASE: bool = True
    PASSWORD_REQUIRE_DIGIT: bool = True
    PASSWORD_REQUIRE_SPECIAL: bool = True

    # Account security
    MAX_LOGIN_ATTEMPTS: int = 5
    ACCOUNT_LOCKOUT_MINUTES: int = 15

    # User database (SQLite)
    USER_DB_FILE: str = "users.db"

    @property
    def USER_DB_PATH(self) -> Path:
        return self.get_data_dir / self.USER_DB_FILE

    # Main database (PostgreSQL) for table data
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "1234"
    POSTGRES_HOST: str = "172.20.10.11"
    POSTGRES_PORT: str = "5432"
    POSTGRES_DB: str = "accessdb"

    # Default admin account
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "Admin123!"

    # Custom database URLs (optional, will be built from parts if not provided)
    DATABASE_URL: Optional[str] = None
    USER_DATABASE_URL: Optional[str] = None

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

    # Redis settings
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_URL: Optional[str] = None

    @property
    def REDIS_CONNECTION_STRING(self) -> str:
        """Build Redis connection string"""
        if self.REDIS_URL:
            return self.REDIS_URL
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    # CORS settings
    CORS_ORIGINS: list[str] = ["*"]
    CORS_ALLOW_CREDENTIALS: bool = True

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 60  # 60 requests per minute

    # Pagination settings
    PAGE_SIZE: int = 100

    # Email settings for password reset (optional)
    SMTP_SERVER: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: str = "noreply@andmetabel.ee"
    SMTP_TLS: bool = True

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Ensure SECRET_KEY is initialized and persistent
        self._ensure_secret_key()

    def _ensure_secret_key(self):
        """Ensure a consistent SECRET_KEY exists, stored in a file"""
        # If SECRET_KEY is provided via environment or other means, use it
        if self.SECRET_KEY:
            logger.info("Using provided SECRET_KEY")
            return

        # Create data directory if it doesn't exist
        self.get_data_dir

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

    class Config:
        env_file = ".env"
        case_sensitive = True


# Create settings instance
settings = Settings()