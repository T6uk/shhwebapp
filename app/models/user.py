# app/models/user.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, func
from datetime import datetime, timedelta
from passlib.context import CryptContext
import uuid

from app.core.user_db import UserBase as Base

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, index=True, nullable=True)  # removed unique constraint for potential null values
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    last_login = Column(DateTime, nullable=True)

    # Security fields
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)
    password_last_changed = Column(DateTime, default=func.now())
    reset_token = Column(String, nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)
    user_preferences = Column(Text, nullable=True)  # JSON-encoded preferences

    @staticmethod
    def verify_password(plain_password, hashed_password):
        return pwd_context.verify(plain_password, hashed_password)

    @staticmethod
    def get_password_hash(password):
        return pwd_context.hash(password)

    @property
    def is_locked(self):
        """Check if the account is currently locked"""
        if self.locked_until and self.locked_until > datetime.utcnow():
            return True
        return False

    def increment_failed_login(self):
        """Increment failed login attempts and lock account if needed"""
        self.failed_login_attempts += 1

        # Lock account after 5 failed attempts
        if self.failed_login_attempts >= 5:
            self.locked_until = datetime.utcnow() + timedelta(minutes=15)

        return self.is_locked

    def reset_failed_login(self):
        """Reset failed login attempts counter"""
        self.failed_login_attempts = 0
        self.locked_until = None

    def generate_password_reset_token(self):
        """Generate a password reset token valid for 24 hours"""
        token = uuid.uuid4().hex
        self.reset_token = token
        self.reset_token_expires = datetime.utcnow() + timedelta(hours=24)
        return token

    def verify_reset_token(self, token):
        """Verify that a reset token is valid"""
        if (self.reset_token == token and
                self.reset_token_expires and
                self.reset_token_expires > datetime.utcnow()):
            return True
        return False

    def clear_reset_token(self):
        """Clear the reset token after it's been used"""
        self.reset_token = None
        self.reset_token_expires = None