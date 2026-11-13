import logging
from datetime import datetime, timezone
from typing import Dict, Optional, Set
from fastapi import WebSocket

logger = logging.getLogger("assistance_hub")


class NotificationHub:
    """Manages active WebSockets for Blind Users, Volunteers, Family Trackers, Hardware Buttons, and Assistant Panels."""

    def __init__(self):
        # user_id -> set of active WebSockets (allows multiple tabs)
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Track connected volunteers
        self.volunteer_users: Set[str] = set()
        # Track connected blind users
        self.blind_users: Set[str] = set()
        # Track connected family user accounts
        self.family_users: Set[str] = set()
        # invite_code -> set of read-only family watcher WebSockets
        self.family_watchers: Dict[str, Set[WebSocket]] = {}
        # device_id -> hardware button socket info
        self.hardware_connections: Dict[str, dict] = {}
        # client_id -> assistant frontend WebSocket listener (works even pre-login)
        self.assistant_subscribers: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str, role: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)

        if role == "volunteer":
            self.volunteer_users.add(user_id)
        elif role == "family":
            self.family_users.add(user_id)
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
                elif role == "family":
                    self.family_users.discard(user_id)
                else:
                    self.blind_users.discard(user_id)
        logger.info(f"WebSocket disconnected: user_id={user_id}")

    async def connect_family_watcher(self, websocket: WebSocket, invite_code: str):
        await websocket.accept()
        code = invite_code.strip().upper()
        if code not in self.family_watchers:
            self.family_watchers[code] = set()
        self.family_watchers[code].add(websocket)
        logger.info(f"Family watcher connected for invite_code={code}")

    def disconnect_family_watcher(self, websocket: WebSocket, invite_code: str):
        code = invite_code.strip().upper()
        if code in self.family_watchers:
            self.family_watchers[code].discard(websocket)
            if not self.family_watchers[code]:
                del self.family_watchers[code]

    async def connect_hardware(self, websocket: WebSocket, device_id: str, user_id: Optional[str] = None):
        await websocket.accept()
        self.hardware_connections[device_id] = {
            "ws": websocket,
            "device_id": device_id,
            "user_id": user_id,
            "connected_at": datetime.now(timezone.utc).isoformat(),
            "last_seen_at": datetime.now(timezone.utc).isoformat(),
            "last_action": None,
        }
        logger.info(f"Hardware button connected: device_id={device_id}, user_id={user_id}")

    def disconnect_hardware(self, device_id: str):
        if device_id in self.hardware_connections:
            del self.hardware_connections[device_id]
        logger.info(f"Hardware button disconnected: device_id={device_id}")

    def record_hardware_activity(self, device_id: str, action: Optional[str] = None):
        entry = self.hardware_connections.get(device_id)
        if entry:
            entry["last_seen_at"] = datetime.now(timezone.utc).isoformat()
            if action:
                entry["last_action"] = action

    async def connect_assistant_subscriber(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.assistant_subscribers[client_id] = websocket
        logger.info(f"Assistant WS subscriber connected: client_id={client_id}")

    def disconnect_assistant_subscriber(self, client_id: str):
        if client_id in self.assistant_subscribers:
            del self.assistant_subscribers[client_id]
        logger.info(f"Assistant WS subscriber disconnected: client_id={client_id}")

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

    async def broadcast_hardware_event(
        self,
        event: dict,
        *,
        target_user_id: Optional[str] = None,
        target_client_id: Optional[str] = None,
    ) -> int:
        """
        Deliver hardware button events to connected Assistant UI clients and user sockets.
        Deduplicates so tabs subscribed via both /ws/assistant and /ws/{user_id}/{role}
        don't trigger twice when client uses unique event_id.
        """
        delivered = 0

        if target_client_id and target_client_id in self.assistant_subscribers:
            ws = self.assistant_subscribers[target_client_id]
            try:
                await ws.send_json(event)
                delivered += 1
            except Exception:
                self.disconnect_assistant_subscriber(target_client_id)
        elif not target_client_id:
            dead_clients = []
            for cid, ws in list(self.assistant_subscribers.items()):
                try:
                    await ws.send_json(event)
                    delivered += 1
                except Exception:
                    dead_clients.append(cid)
            for cid in dead_clients:
                self.disconnect_assistant_subscriber(cid)

        if target_user_id:
            if target_user_id in self.active_connections and len(self.active_connections[target_user_id]) > 0:
                await self.send_to_user(target_user_id, event)
                delivered += len(self.active_connections[target_user_id])
        else:
            for b_uid in list(self.blind_users):
                if b_uid in self.active_connections:
                    await self.send_to_user(b_uid, event)
                    delivered += len(self.active_connections[b_uid])

        return delivered

    async def send_to_family_watchers(self, invite_code: str, message: dict):
        """Broadcast live telemetry / status / SOS / geofence alerts to family tracking viewers."""
        code = invite_code.strip().upper()
        if code in self.family_watchers:
            dead_sockets = []
            for ws in list(self.family_watchers[code]):
                try:
                    await ws.send_json(message)
                except Exception as e:
                    logger.warning(f"Failed to send to family watcher {code}: {e}")
                    dead_sockets.append(ws)
            for ws in dead_sockets:
                self.family_watchers[code].discard(ws)

    async def notify_volunteers(self, volunteer_ids: list[str], message: dict):
        """Dispatch an assistance alert to a specific list of nearby volunteers."""
        for v_id in volunteer_ids:
            await self.send_to_user(v_id, message)


notification_hub = NotificationHub()
