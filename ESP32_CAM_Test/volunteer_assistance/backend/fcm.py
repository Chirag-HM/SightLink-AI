import logging
import requests
from typing import Optional
from .config import settings

logger = logging.getLogger("fcm_service")


class FCMService:
    """
    Firebase Cloud Messaging (FCM) + Web Push VAPID notification dispatcher.
    Never fakes credentials; transparently reports configuration status while
    delivering live WebSocket/Service-Worker push payloads when configured.
    """

    def __init__(self):
        self.server_key = settings.FCM_SERVER_KEY
        self.vapid_public_key = settings.VAPID_PUBLIC_KEY
        self.vapid_private_key = settings.VAPID_PRIVATE_KEY

    @property
    def is_configured(self) -> bool:
        return bool(self.server_key and self.server_key.strip())

    @property
    def is_vapid_configured(self) -> bool:
        return bool(
            self.vapid_public_key
            and self.vapid_public_key.strip()
            and self.vapid_private_key
            and self.vapid_private_key.strip()
        )

    def get_status(self) -> dict:
        if self.is_configured or self.is_vapid_configured:
            providers = []
            if self.is_configured:
                providers.append("Firebase Cloud Messaging")
            if self.is_vapid_configured:
                providers.append("VAPID Web Push")
            return {
                "configured": True,
                "provider": " + ".join(providers),
                "vapid_public_key": self.vapid_public_key,
                "message": f"Push notifications configured ({' + '.join(providers)})."
            }
        return {
            "configured": False,
            "provider": "WebSocket + Service Worker Bridge",
            "vapid_public_key": None,
            "message": "FCM_SERVER_KEY / VAPID_PRIVATE_KEY not set in .env; active WebSockets and Service Worker notifications are delivering real-time alerts."
        }

    def send_push_notification(
        self,
        token: str,
        title: str,
        body: str,
        data: Optional[dict] = None,
        click_action: str = "/volunteers",
        actions: Optional[list[dict]] = None
    ) -> dict:
        if not self.is_configured:
            logger.info("FCM push skipped: FCM_SERVER_KEY is not configured.")
            return {
                "success": False,
                "error": "FCM_NOT_CONFIGURED",
                "detail": "Set FCM_SERVER_KEY environment variable to enable remote FCM push."
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
                "click_action": click_action
            },
            "data": {**(data or {}), "actions": actions or []},
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

    def send_web_push(self, subscription_info: dict, payload: dict) -> dict:
        if not self.is_vapid_configured:
            return {
                "success": False,
                "error": "VAPID_NOT_CONFIGURED",
                "detail": "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to send background VAPID push."
            }
        try:
            from pywebpush import webpush
            import json
            webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload),
                vapid_private_key=self.vapid_private_key,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
            )
            return {"success": True}
        except ImportError:
            return {
                "success": False,
                "error": "PYWEBPUSH_NOT_INSTALLED",
                "detail": "Install pywebpush to send encrypted VAPID push payloads directly from Python."
            }
        except Exception as e:
            logger.warning(f"VAPID web push error: {e}")
            return {"success": False, "error": str(e)}


fcm_service = FCMService()
