# app/core/user_db.py
from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session
import logging
import os

from app.core.config import settings

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

# Create Base model class
UserBase = declarative_base()
UserMetadata = MetaData()


def get_user_db():
    """Synchronous dependency for getting user database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_user_db():
    """Initialize user database and tables"""
    from app.models.user import User  # Import here to avoid circular import
    from app.core.security import get_password_hash
    from datetime import datetime
    import sqlite3

    # Create tables
    UserBase.metadata.create_all(bind=user_engine)

    # Check if we need to add the can_edit column
    db = SessionLocal()
    try:
        # Check if the can_edit column exists
        try:
            db.query(User.can_edit).limit(1).all()
            logger.info("can_edit column already exists in users table")
        except Exception as e:
            if "no such column" in str(e).lower():
                logger.info("Adding can_edit column to users table")
                # Connect directly to SQLite to add the column
                sqlite_connection = sqlite3.connect(settings.USER_DB_PATH)
                cursor = sqlite_connection.cursor()
                try:
                    cursor.execute("ALTER TABLE users ADD COLUMN can_edit BOOLEAN DEFAULT FALSE")
                    sqlite_connection.commit()
                    logger.info("Added can_edit column to users table")
                except sqlite3.OperationalError as e:
                    if "duplicate column name" not in str(e).lower():
                        raise
                    logger.info("can_edit column already exists")
                finally:
                    cursor.close()
                    sqlite_connection.close()
            else:
                raise

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
                can_edit=True,  # Give admin edit permission by default
                created_at=datetime.utcnow(),
                password_last_changed=datetime.utcnow()
            )

            db.add(admin)
            db.commit()
            logger.info(f"Created default admin user: {settings.ADMIN_USERNAME}")
        else:
            logger.info(f"Admin user already exists: {settings.ADMIN_USERNAME}")

            # If admin exists but doesn't have can_edit set, update it
            if not hasattr(admin, 'can_edit') or admin.can_edit is None:
                admin.can_edit = True
                db.commit()
                logger.info(f"Updated admin user with edit permissions")

    except Exception as e:
        logger.error(f"Error initializing user database: {e}")
        db.rollback()
        raise
    finally:
        db.close()

    return True