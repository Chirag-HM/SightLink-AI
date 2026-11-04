import logging
import requests
from typing import Optional
from .config import settings

logger = logging.getLogger("fcm_service")

class FCMService:
    """
    Firebase Cloud Messaging (FCM) Web Push notification sender.
    Complies with Requirement #14: Never fakes notifications.
    If FCM is unconfigured, clearly reports the missing credentials.
    """
    def __init__(self):
        self.server_key = settings.FCM_SERVER_KEY

    @property
    def is_configured(self) -> bool:
        return bool(self.server_key and self.server_key.strip())

    def get_status(self) -> dict:
        if self.is_configured:
            return {
                "configured": True,
                "provider": "Firebase Cloud Messaging",
                "message": "FCM server key is configured for background web push."
            }
        return {
            "configured": False,
            "provider": "Firebase Cloud Messaging",
            "message": "FCM_SERVER_KEY is not configured in environment variables. Background web push is inactive; active dashboard WebSockets are delivering live alerts."
        }

    def send_push_notification(
        self,
        token: str,
        title: str,
        body: str,
        data: Optional[dict] = None
    ) -> dict:
        if not self.is_configured:
            logger.info("FCM push skipped: FCM_SERVER_KEY is not configured.")
            return {
                "success": False,
                "error": "FCM_NOT_CONFIGURED",
                "detail": "Set FCM_SERVER_KEY environment variable to enable background web push."
            }

        headers = {
            "Authorization": f"key={self.server_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "to": token,
            "notification": {
                "title": title,
                "body": body,
                "icon": "/logo192.png",
                "click_action": "/volunteer/dashboard"
            },
            "data": data or {},
            "priority": "high"
        }

        try:
            resp = requests.post(
                "https://fcm.googleapis.com/fcm/send",
                headers=headers,
                json=payload,
                timeout=5.0
            )
            return {
                "success": resp.status_code == 200,
                "status_code": resp.status_code,
                "response": resp.json() if resp.status_code == 200 else resp.text
            }
        except Exception as e:
            logger.error(f"FCM push request failed: {e}")
            return {"success": False, "error": str(e)}

fcm_service = FCMService()
