# app/core/user_db.py
from sqlalchemy import create_engine, MetaData
from sqlalchemy.orm import sessionmaker, scoped_session
import logging
import os

from app.core.config import settings
from app.core.db_base import UserBase, UserMetadata  # Import from new module

# Configure logger
logger = logging.getLogger(__name__)

# Ensure the data directory exists
os.makedirs(os.path.dirname(settings.USER_DB_PATH), exist_ok=True)

# Create SQLite engine for user database
user_engine = create_engine(
    settings.SQLALCHEMY_USER_DATABASE_URI,
    connect_args={"check_same_thread": False},  # Needed for SQLite
    echo=False,
    future=True,
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=user_engine)


def get_user_db():
    """Synchronous dependency for getting user database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_user_db():
    """Initialize user database and tables"""
    # Import models here to avoid circular import
    from app.models.user import User
    from app.models.column_settings import ColumnSetting
    from app.models.data_change import DataChange
    from app.models.change_log import ChangeLog
    from app.models.saved_filter import SavedFilter
    from app.core.security import get_password_hash
    from datetime import datetime

    # Create tables
    UserBase.metadata.create_all(bind=user_engine)

    # Check if admin user exists
    db = SessionLocal()
    try:
        # First check if admin user exists
        admin = db.query(User).filter(User.username == settings.ADMIN_USERNAME).first()

        # Only create if admin doesn't exist
        if admin is None:
            logger.info(f"Admin user doesn't exist. Creating new admin: {settings.ADMIN_USERNAME}")

            # Create default admin user
            admin = User(
                username=settings.ADMIN_USERNAME,
                email="admin@example.com",
                full_name="Administrator",
                hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
                is_active=True,
                is_admin=True,
                can_edit=True,  # Admin can edit by default
                created_at=datetime.utcnow(),
                password_last_changed=datetime.utcnow()
            )

            db.add(admin)
            db.commit()
            logger.info(f"Created default admin user: {settings.ADMIN_USERNAME}")
        else:
            logger.info(f"Admin user already exists: {settings.ADMIN_USERNAME}")

    except Exception as e:
        logger.error(f"Error initializing user database: {e}")
        db.rollback()
        raise
    finally:
        db.close()

    return True