# app/core/websocket.py
import logging
import json
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

# Connected clients by user ID
connected_clients: Dict[int, List[WebSocket]] = {}


async def connect_client(websocket: WebSocket, user_id: int):
    """Connect a client websocket and register it by user ID"""
    await websocket.accept()

    if user_id not in connected_clients:
        connected_clients[user_id] = []

    connected_clients[user_id].append(websocket)
    logger.info(f"WebSocket connected for user {user_id}. Total connections: {len(connected_clients[user_id])}")


async def disconnect_client(websocket: WebSocket, user_id: int):
    """Disconnect a client and remove it from registry"""
    if user_id in connected_clients:
        try:
            connected_clients[user_id].remove(websocket)
            logger.info(
                f"WebSocket disconnected for user {user_id}. Remaining connections: {len(connected_clients[user_id])}")

            # Clean up empty entries
            if not connected_clients[user_id]:
                del connected_clients[user_id]
        except ValueError:
            pass


async def broadcast_message(message: Dict[str, Any], exclude_user_id: Optional[int] = None):
    """Broadcast a message to all connected clients except the sender"""
    if not connected_clients:
        return

    message_str = json.dumps(message)

    # Create a copy of the keys to avoid modification during iteration
    user_ids = list(connected_clients.keys())

    for user_id in user_ids:
        # Skip the sender
        if user_id == exclude_user_id:
            continue

        # Send to all connections for this user
        for websocket in connected_clients[user_id]:
            try:
                await websocket.send_text(message_str)
            except Exception as e:
                logger.error(f"Error sending message to user {user_id}: {str(e)}")
                # We'll handle disconnection properly when the WebSocketDisconnect exception is raised


async def send_message_to_user(user_id: int, message: Dict[str, Any]):
    """Send a message to a specific user's connections"""
    if user_id not in connected_clients:
        return

    message_str = json.dumps(message)

    for websocket in connected_clients[user_id]:
        try:
            await websocket.send_text(message_str)
        except Exception as e:
            logger.error(f"Error sending message to user {user_id}: {str(e)}")