import json
import os
import socket
import sys
import threading
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import httpx
import uvicorn
import websockets

ROOT_DIR = Path(__file__).resolve().parents[4]
ESP_CAM_DIR = ROOT_DIR / "ESP32_CAM_Test"
for p in (str(ROOT_DIR), str(ESP_CAM_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from main import app as unified_app  # noqa: E402
from volunteer_assistance.backend.main import app as backend_app  # noqa: E402
from volunteer_assistance.backend.database import Base, SessionLocal, engine, run_migrations  # noqa: E402
from volunteer_assistance.backend.fcm import fcm_service  # noqa: E402
from volunteer_assistance.backend.gmail_sender import gmail_sender  # noqa: E402
from volunteer_assistance.backend.notification_service import notification_service  # noqa: E402
from volunteer_assistance.backend.telegram_bot import process_telegram_update, telegram_bot  # noqa: E402


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


class TestAllNonLoginFeatures(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        run_migrations()

    async def asyncSetUp(self):
        self.transport = httpx.ASGITransport(app=unified_app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://testserver")
        self.suffix = uuid.uuid4().hex[:8]
        self._ip_seq = 1
        self.sent_emails = []
        self.sent_telegrams = []

        def _capture_email(to_email: str, subject: str, html_body: str, text_body: str):
            self.sent_emails.append({
                "to": to_email,
                "subject": subject,
                "html": html_body,
                "text": text_body,
            })

        def _capture_tg(chat_id: str, text: str, button_url=None):
            self.sent_telegrams.append({
                "chat_id": str(chat_id),
                "text": text,
                "button_url": button_url,
            })
            return True

        gmail_sender.set_transport_override(_capture_email)
        telegram_bot.set_sender_override(_capture_tg)
        notification_service.set_retry_delays((0.0, 0.0))

    async def asyncTearDown(self):
        gmail_sender.set_transport_override(None)
        telegram_bot.set_sender_override(None)
        notification_service.set_retry_delays((0.35, 0.9))
        await self.client.aclose()

    def _ip_headers(self, extra=None):
        self._ip_seq += 1
        headers = {"X-Forwarded-For": f"10.50.{self._ip_seq // 250}.{(self._ip_seq % 250) + 1}"}
        if extra:
            headers.update(extra)
        return headers

    def _latest_otp(self, email: str) -> str:
        import re

        for mail in reversed(self.sent_emails):
            if mail["to"].lower() == email.lower():
                m = re.search(r"(\d{6})\s+is your SightLink", mail["subject"])
                if m:
                    return m.group(1)
                m2 = re.search(r"verification code is:\s*(\d{6})", mail["text"])
                if m2:
                    return m2.group(1)
        return ""

    async def _create_verified_user(self, role: str, full_name: str):
        email = f"{role}_{self.suffix}_{uuid.uuid4().hex[:4]}@example.com"
        username = f"{role}_{self.suffix}_{uuid.uuid4().hex[:4]}"
        reg_payload = {
            "username": username,
            "email": email,
            "password": "password123",
            "full_name": full_name,
            "role": role,
        }
        if role == "volunteer":
            reg_payload["verification_method"] = "id"
            reg_payload["id_number"] = f"NGO-{self.suffix}"
        r = await self.client.post("/api/auth/register", json=reg_payload, headers=self._ip_headers())
        self.assertEqual(r.status_code, 201, r.text)
        token = r.json()["access_token"]
        headers = self._ip_headers({"Authorization": f"Bearer {token}"})
        otp = self._latest_otp(email)
        v = await self.client.post("/api/auth/email/verify", json={"email": email, "code": otp}, headers=headers)
        self.assertEqual(v.status_code, 200, v.text)
        return {
            "user_id": v.json()["user_id"],
            "email": email,
            "headers": headers,
        }

    async def test_sos_dispatches_to_blind_users_own_telegram_and_self_email_when_no_guardians(self):
        blind = await self._create_verified_user("blind_user", "Chirag Test")

        # Link blind user's own Telegram chat without adding any family guardian yet
        r_tg = await self.client.post("/api/telegram/connect-link", headers=blind["headers"])
        self.assertEqual(r_tg.status_code, 200)
        token = r_tg.json()["token"]

        db = SessionLocal()
        try:
            res = await process_telegram_update(
                db,
                {
                    "update_id": 9001,
                    "message": {
                        "chat": {"id": 6028243510, "username": "Mruknown56"},
                        "from": {"username": "Mruknown56"},
                        "text": f"/start {token}",
                    },
                },
            )
            self.assertEqual(res["action"], "connected")
        finally:
            db.close()

        self.sent_emails.clear()
        self.sent_telegrams.clear()

        r_sos = await self.client.post(
            "/api/safety/sos",
            json={"latitude": 12.9716, "longitude": 77.5946, "battery_level": 77, "notes": "Test SOS"},
            headers=blind["headers"],
        )
        self.assertEqual(r_sos.status_code, 200, r_sos.text)
        body = r_sos.json()

        self.assertEqual(body["status"], "sos_active")
        self.assertEqual(body["approved_guardians_count"], 0)
        self.assertTrue(body["self_telegram_connected"])
        self.assertEqual(body["self_telegram_username"], "Mruknown56")
        self.assertIn("telegram", body["sent_channels"])
        self.assertIn("email", body["sent_channels"])

        tg_hits = [m for m in self.sent_telegrams if m["chat_id"] == "6028243510"]
        self.assertEqual(len(tg_hits), 1, self.sent_telegrams)
        self.assertIn("EMERGENCY SOS", tg_hits[0]["text"])
        self.assertIn("maps.google.com/?q=12.971600,77.594600", tg_hits[0]["button_url"])

        email_hits = [m for m in self.sent_emails if m["to"] == blind["email"]]
        self.assertEqual(len(email_hits), 1, self.sent_emails)

        # Delivery logs should reflect self deliveries under /api/family/notifications/logs
        r_logs = await self.client.get("/api/family/notifications/logs", headers=blind["headers"])
        self.assertEqual(r_logs.status_code, 200)
        logs = r_logs.json()
        self.assertTrue(
            any(l["channel"] == "telegram" and l["status"] == "sent" and l["recipient_scope"] == "self" for l in logs),
            logs,
        )

        # Resolve SOS cleanly
        self.sent_telegrams.clear()
        r_res = await self.client.post("/api/safety/sos/resolve", headers=blind["headers"])
        self.assertEqual(r_res.status_code, 200)
        self.assertFalse(r_res.json()["sos_active"])
        self.assertTrue(any("SOS Resolved" in m["text"] for m in self.sent_telegrams), self.sent_telegrams)

    async def test_webpush_unconfigured_vapid_logs_skipped_not_sent(self):
        blind = await self._create_verified_user("blind_user", "Vapid Tester")
        fam = await self._create_verified_user("family", "Guardian Tester")

        r_code = await self.client.post(
            "/api/family/sharing/consent",
            json={"consent_given": True, "is_sharing": True},
            headers=blind["headers"],
        )
        code = r_code.json()["invite_code"]
        r_lnk = await self.client.post(
            "/api/family/link",
            json={"invite_code": code, "relationship_label": "Parent"},
            headers=fam["headers"],
        )
        link_id = r_lnk.json()["link_id"]
        r_conf = await self.client.post(
            f"/api/family/members/{link_id}/confirm",
            json={"approved": True},
            headers=blind["headers"],
        )
        self.assertEqual(r_conf.status_code, 200, r_conf.text)
        r_pref = await self.client.put(
            f"/api/family/my-links/{link_id}/preferences",
            json={"notify_email": False, "notify_telegram": False, "notify_web_push": True},
            headers=fam["headers"],
        )
        self.assertEqual(r_pref.status_code, 200, r_pref.text)
        await self.client.post(
            "/api/push/subscribe",
            json={
                "role": "family",
                "invite_code": code,
                "endpoint": f"https://push.example.invalid/{self.suffix}",
                "p256dh": "dummy_p256dh",
                "auth": "dummy_auth",
            },
            headers=fam["headers"],
        )

        orig_pub, orig_priv = fcm_service.vapid_public_key, fcm_service.vapid_private_key
        fcm_service.vapid_public_key = ""
        fcm_service.vapid_private_key = ""
        try:
            db = SessionLocal()
            try:
                summary = await notification_service.dispatch_family_alert(
                    db,
                    blind["user_id"],
                    event_type="SOS_TRIGGERED",
                    category="sos",
                    title="SOS Check",
                    summary="Checking VAPID unconfigured handling",
                    urgent=True,
                    dedup_entity=f"vapid-{self.suffix}",
                )
            finally:
                db.close()
        finally:
            fcm_service.vapid_public_key = orig_pub
            fcm_service.vapid_private_key = orig_priv

        wp_results = [r for r in summary if r["channel"] == "web_push"]
        self.assertEqual(len(wp_results), 1, summary)
        self.assertEqual(wp_results[0]["status"], "skipped", wp_results)
        self.assertIn("VAPID", wp_results[0]["error"])

    async def test_bmtc_routes_available_on_both_apps_including_spa_fallback_server(self):
        def _mock_bmtc_post(url, **kwargs):
            if "GetAllRouteList" in url:
                return _FakeResponse(200, {"data": [{"routeno": "500-D", "routeparentid": 101}]})
            if "SearchRoute_v2" in url:
                return _FakeResponse(200, {"data": [{"routeno": "500-D", "routeparentid": 101}]})
            if "SearchByRouteDetails_v4" in url:
                return _FakeResponse(
                    200,
                    {
                        "up": {
                            "data": [
                                {
                                    "vehicleDetails": [
                                        {
                                            "vehicleid": 99123,
                                            "vehiclenumber": "KA-01-F-5544",
                                            "centerlat": 12.9725,
                                            "centerlong": 77.5955,
                                            "heading": 225,
                                            "servicetype": "Vajra AC",
                                            "lastrefreshon": "just now",
                                        }
                                    ]
                                }
                            ]
                        },
                        "down": {"data": []},
                    },
                )
            if "VehicleTripDetails_v2" in url:
                return _FakeResponse(
                    200,
                    {
                        "LiveLocation": [
                            {
                                "vehicleid": 99123,
                                "vehiclenumber": "KA-01-F-5544",
                                "latitude": 12.9725,
                                "longitude": 77.5955,
                                "location": "MG Road",
                                "heading": 225,
                                "servicetype": "Vajra AC",
                                "lastrefreshon": "just now",
                            }
                        ]
                    },
                )
            return _FakeResponse(200, {})

        with patch("volunteer_assistance.backend.routes.bmtc_routes.requests.post", side_effect=_mock_bmtc_post):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=backend_app),
                base_url="http://testserver",
            ) as b_client:
                r_routes = await b_client.get("/routes")
                self.assertEqual(r_routes.status_code, 200)
                self.assertEqual(r_routes.headers["content-type"].split(";")[0], "application/json")
                self.assertEqual(r_routes.json()["route_count"], 1)

                r_bus = await b_client.get("/bus-route/500-D")
                self.assertEqual(r_bus.status_code, 200)
                self.assertEqual(r_bus.json()["bus_count"], 1)

                r_near = await b_client.get("/nearby-bus/500-D?latitude=12.9716&longitude=77.5946")
                self.assertEqual(r_near.status_code, 200)
                self.assertTrue(r_near.json()["success"])
                self.assertIn("KA-01-F-5544", r_near.json()["message"])

                r_voice = await b_client.get("/voice-bus/500-D?latitude=12.9716&longitude=77.5946")
                self.assertEqual(r_voice.status_code, 200)
                self.assertTrue(r_voice.json()["success"])

                r_veh = await b_client.get("/bus/99123")
                self.assertEqual(r_veh.status_code, 200)
                self.assertEqual(r_veh.json()["bus_number"], "KA-01-F-5544")

                r_404 = await b_client.get("/api/nonexistent-endpoint")
                self.assertEqual(r_404.status_code, 404)

    async def test_stick_gps_sync_and_history_endpoints(self):
        blind = await self._create_verified_user("blind_user", "Stick Rider")
        r_sync = await self.client.post(
            "/api/stick/gps-sync",
            json={
                "fix": True,
                "latitude": 12.9716,
                "longitude": 77.5946,
                "satellites": 9,
                "distance_cm": 170.0,
                "button_pressed": False,
            },
        )
        self.assertEqual(r_sync.status_code, 200, r_sync.text)
        self.assertTrue(r_sync.json()["latest"]["fix"])

        r_gps = await self.client.get("/api/stick/gps?ip=127.0.0.1")
        self.assertEqual(r_gps.status_code, 200, r_gps.text)
        self.assertAlmostEqual(r_gps.json()["latitude"], 12.9716, places=4)

        r_ultra = await self.client.get("/api/ultrasonic/distance")
        self.assertEqual(r_ultra.status_code, 200, r_ultra.text)
        self.assertAlmostEqual(r_ultra.json()["distance_cm"], 170.0, places=1)

        r_vis_idle = await self.client.get("/api/vision/detections")
        self.assertEqual(r_vis_idle.status_code, 200, r_vis_idle.text)
        self.assertIsInstance(r_vis_idle.json()["detections"], list)

        r_vis_post = await self.client.post(
            "/api/vision/detections",
            json={"detector": "yolov8n", "detections": [{"id": "d1", "label": "Person", "confidence": 92}]},
        )
        self.assertEqual(r_vis_post.status_code, 200, r_vis_post.text)
        r_vis_stat = await self.client.get("/api/vision/status")
        self.assertEqual(r_vis_stat.status_code, 200)
        self.assertTrue(r_vis_stat.json()["connected"])
        self.assertEqual(r_vis_stat.json()["detection_count"], 1)

        r_fam_loc = await self.client.post(
            "/api/family/location",
            json={"latitude": 12.9716, "longitude": 77.5946, "battery_level": 82},
            headers=blind["headers"],
        )
        self.assertEqual(r_fam_loc.status_code, 200, r_fam_loc.text)

        for ep in ("/api/assistance/history", "/api/live-assist/history", "/api/family/my/timeline"):
            r = await self.client.get(ep, headers=blind["headers"])
            self.assertEqual(r.status_code, 200, r.text)
            self.assertIsInstance(r.json(), list)

    async def test_live_websocket_webrtc_relay_and_family_watcher(self):
        port = _find_free_port()
        config = uvicorn.Config(backend_app, host="127.0.0.1", port=port, log_level="error")
        server = uvicorn.Server(config)
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        for _ in range(50):
            if server.started:
                break
            time.sleep(0.05)
        self.assertTrue(server.started, "Test uvicorn server failed to start")

        try:
            async with websockets.connect(f"ws://127.0.0.1:{port}/ws/user_a/blind_user") as ws_a, \
                       websockets.connect(f"ws://127.0.0.1:{port}/ws/user_b/volunteer") as ws_b:
                await ws_a.send("ping")
                self.assertEqual(await ws_a.recv(), "pong")

                await ws_a.send(json.dumps({
                    "type": "WEBRTC_OFFER",
                    "target_user_id": "user_b",
                    "sdp": {"type": "offer", "sdp": "v=0..."},
                }))
                relayed = json.loads(await ws_b.recv())
                self.assertEqual(relayed["type"], "WEBRTC_OFFER")
                self.assertEqual(relayed["from_user_id"], "user_a")

            async with websockets.connect(f"ws://127.0.0.1:{port}/ws/family/SL-TEST-1234") as ws_fam:
                await ws_fam.send("ping")
                self.assertEqual(await ws_fam.recv(), "pong")
        finally:
            server.should_exit = True
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
