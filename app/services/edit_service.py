# app/services/edit_service.py
import logging
import os
import json
from datetime import datetime
from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any

from app.models.user import User
from app.models.column_settings import ColumnSetting
from app.models.data_change import DataChange
from app.models.change_log import ChangeLog
from app.core.config import settings

# Set up logging
logger = logging.getLogger(__name__)

# Edit mode password - in production, this should be configurable or per-user
EDIT_PASSWORD = "EditData123!"


async def verify_edit_permission(user: User, password: str) -> bool:
    """Verify if a user has permission to edit and the password is correct"""
    if not user.can_edit:
        return False

    # Simple password check - in production, use more secure methods
    return password == EDIT_PASSWORD


async def get_editable_columns(db: Session, user: User) -> list:
    """Get all columns that are marked as editable"""
    if not user.can_edit:
        return []

    editable_columns = db.query(ColumnSetting).filter(ColumnSetting.is_editable == True).all()
    return [col.column_name for col in editable_columns]


async def update_cell_value(
        db: AsyncSession,
        user_db: Session,
        user: User,
        table_name: str,
        row_id: str,
        column_name: str,
        old_value: str,
        new_value: str,
        session_id: str,
        client_ip: Optional[str] = None,
        user_agent: Optional[str] = None
) -> bool:
    """Update a cell value and track the change"""
    # Verify user has edit permission
    if not user.can_edit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit data"
        )

    # Verify column is editable
    editable_column = user_db.query(ColumnSetting).filter(
        ColumnSetting.column_name == column_name,
        ColumnSetting.is_editable == True
    ).first()

    if not editable_column:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Column {column_name} is not editable"
        )

    try:
        # Convert row_id to the appropriate type based on data inspection
        try:
            # Try to convert to integer first
            row_id_value = int(row_id)
            logger.debug(f"Converted row_id '{row_id}' to integer: {row_id_value}")
        except ValueError:
            # If not an integer, keep as string and use proper SQL for string comparison
            row_id_value = row_id
            logger.debug(f"Using row_id as string: {row_id_value}")

        # Update the value in the database using parameters
        update_sql = f"""
            UPDATE "{table_name}"
            SET "{column_name}" = :new_value
            WHERE id = :row_id
        """

        await db.execute(
            text(update_sql),
            {"new_value": new_value, "row_id": row_id_value}
        )

        # Commit the change
        await db.commit()

        # Track the change for undo functionality
        track_change = DataChange(
            user_id=user.id,
            table_name=table_name,
            row_id=row_id,
            column_name=column_name,
            old_value=old_value,
            new_value=new_value,
            session_id=session_id
        )

        user_db.add(track_change)

        # Log the change for audit
        change_log = ChangeLog(
            user_id=user.id,
            username=user.username,
            table_name=table_name,
            row_id=row_id,
            column_name=column_name,
            old_value=old_value,
            new_value=new_value,
            client_ip=client_ip,
            user_agent=user_agent
        )

        user_db.add(change_log)
        user_db.commit()

        # Also write to a log file for additional security
        log_data_change(
            user.username,
            table_name,
            row_id,
            column_name,
            old_value,
            new_value
        )

        # Also notify other users (using Redis pub/sub)
        await notify_data_change(table_name, row_id, column_name, user.id)

        return True

    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating cell value: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )


async def get_session_changes(user_db: Session, user: User, session_id: str) -> list:
    """Get all changes made in a session for undo functionality"""
    changes = user_db.query(DataChange).filter(
        DataChange.session_id == session_id,
        DataChange.user_id == user.id
    ).order_by(DataChange.changed_at.desc()).all()

    return changes


async def undo_change(
        db: AsyncSession,
        user_db: Session,
        user: User,
        change_id: int,
        client_ip: Optional[str] = None,
        user_agent: Optional[str] = None
) -> bool:
    """Undo a specific change"""
    # Find the change
    change = user_db.query(DataChange).filter(
        DataChange.id == change_id,
        DataChange.user_id == user.id
    ).first()

    if not change:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Change not found or you don't have permission to undo it"
        )

    try:
        # Convert row_id to the appropriate type
        try:
            # Try to convert to integer first
            row_id_value = int(change.row_id)
            logger.debug(f"Converted row_id '{change.row_id}' to integer: {row_id_value}")
        except ValueError:
            # If not an integer, keep as string
            row_id_value = change.row_id
            logger.debug(f"Using row_id as string: {row_id_value}")

        # Update the database with the old value
        update_sql = f"""
            UPDATE "{change.table_name}"
            SET "{change.column_name}" = :old_value
            WHERE id = :row_id
        """

        await db.execute(
            text(update_sql),
            {"old_value": change.old_value, "row_id": row_id_value}
        )

        await db.commit()

        # Log the undo operation
        undo_log = ChangeLog(
            user_id=user.id,
            username=user.username,
            table_name=change.table_name,
            row_id=change.row_id,
            column_name=change.column_name,
            old_value=change.new_value,  # Current value before undo
            new_value=change.old_value,  # Value after undo (original value)
            client_ip=client_ip,
            user_agent=user_agent
        )

        user_db.add(undo_log)

        # Delete the change record
        user_db.delete(change)
        user_db.commit()

        # Log the undo action to file
        log_data_change(
            user.username,
            change.table_name,
            change.row_id,
            change.column_name,
            change.new_value,
            change.old_value,
            is_undo=True
        )

        # Notify other users about the change
        await notify_data_change(change.table_name, change.row_id, change.column_name)

        return True

    except Exception as e:
        await db.rollback()
        logger.error(f"Error undoing change: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )


async def check_for_changes(user_db: Session, user: User, last_checked: Optional[datetime] = None) -> Dict[str, Any]:
    """Check for changes made by other users since last check"""
    try:
        if not last_checked:
            # Default to getting the last 5 minutes of changes
            from datetime import timedelta
            last_checked = datetime.utcnow() - timedelta(minutes=5)

        # Get changes made by other users
        changes = user_db.query(ChangeLog).filter(
            ChangeLog.changed_at > last_checked,
            ChangeLog.user_id != user.id  # Only get other users' changes
        ).order_by(ChangeLog.changed_at.desc()).all()

        return {
            "has_changes": len(changes) > 0,
            "changes": [
                {
                    "id": change.id,
                    "username": change.username,
                    "table_name": change.table_name,
                    "row_id": change.row_id,
                    "column_name": change.column_name,
                    "changed_at": change.changed_at.isoformat()
                }
                for change in changes[:10]  # Limit to the 10 most recent changes
            ],
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Error checking for changes: {str(e)}")
        return {
            "has_changes": False,
            "changes": [],
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


def log_data_change(
        username: str,
        table_name: str,
        row_id: str,
        column_name: str,
        old_value: str,
        new_value: str,
        is_undo: bool = False
) -> None:
    """Log data changes to a file for additional security and audit"""
    try:
        # Create logs directory if it doesn't exist
        log_dir = os.path.join(settings.BASE_DIR, "logs")
        os.makedirs(log_dir, exist_ok=True)

        # Get the current date for the log file name
        current_date = datetime.utcnow().strftime("%Y%m%d")
        log_file = os.path.join(log_dir, f"data_changes_{current_date}.log")

        # Format the log entry
        timestamp = datetime.utcnow().isoformat()
        operation = "UNDO" if is_undo else "UPDATE"

        log_entry = (
            f"{timestamp} | {username} | {operation} | "
            f"{table_name} | {row_id} | {column_name} | "
            f"'{old_value}' -> '{new_value}'\n"
        )

        # Write to the log file
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(log_entry)

    except Exception as e:
        logger.error(f"Error writing to change log file: {str(e)}")


async def notify_data_change(table_name: str, row_id: str, column_name: str, user_id: int = None) -> None:
    """Notify other users about data changes using both Redis pub/sub and WebSockets"""
    try:
        # Using Redis
        from app.core.cache import get_redis, invalidate_cache
        redis = await get_redis()

        # Invalidate relevant cache to ensure fresh data on next query
        await invalidate_cache(f"table_data:*")

        # Create a message with change details
        message = {
            "type": "data_change",
            "table_name": table_name,
            "row_id": row_id,
            "column_name": column_name,
            "timestamp": datetime.utcnow().isoformat(),
            "user_id": user_id
        }

        # Publish to data_changes channel
        await redis.publish("data_changes", json.dumps(message))

        # Also notify via WebSockets
        from app.core.websocket import broadcast_message
        await broadcast_message(message, exclude_user_id=user_id)

        logger.info(f"Published change notification for {table_name}.{column_name}")

    except Exception as e:
        logger.error(f"Error notifying data change: {str(e)}")