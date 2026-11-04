import json
import logging
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger("assistance_hub")

class NotificationHub:
    """Manages active WebSockets for Blind Users and Volunteers."""
    def __init__(self):
        # user_id -> set of active WebSockets (allows multiple tabs)
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Track connected volunteers
        self.volunteer_users: Set[str] = set()
        # Track connected blind users
        self.blind_users: Set[str] = set()

    async def connect(self, websocket: WebSocket, user_id: str, role: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)

        if role == "volunteer":
            self.volunteer_users.add(user_id)
        else:
            self.blind_users.add(user_id)
        logger.info(f"WebSocket connected: user_id={user_id}, role={role}. Total connections={len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket, user_id: str, role: str):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                if role == "volunteer":
                    self.volunteer_users.discard(user_id)
                else:
                    self.blind_users.discard(user_id)
        logger.info(f"WebSocket disconnected: user_id={user_id}")

    async def send_to_user(self, user_id: str, message: dict):
        """Send message to all open tabs of a specific user."""
        if user_id in self.active_connections:
            dead_sockets = []
            for ws in list(self.active_connections[user_id]):
                try:
                    await ws.send_json(message)
                except Exception as e:
                    logger.warning(f"Failed to send to socket for {user_id}: {e}")
                    dead_sockets.append(ws)
            for ws in dead_sockets:
                self.active_connections[user_id].discard(ws)

    async def notify_volunteers(self, volunteer_ids: list[str], message: dict):
        """Dispatch an assistance alert to a specific list of nearby volunteers."""
        for v_id in volunteer_ids:
            await self.send_to_user(v_id, message)

notification_hub = NotificationHub()
