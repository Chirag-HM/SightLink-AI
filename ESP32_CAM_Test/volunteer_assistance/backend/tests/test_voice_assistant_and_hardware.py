import asyncio
import io
import json
import os
import socket
import struct
import sys
import threading
import time
import unittest
import uuid
import zipfile
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
from volunteer_assistance.backend.bus_service import (  # noqa: E402
    GTFSBusProvider,
    bus_service,
    parse_gtfs_rt_feed,
)
from volunteer_assistance.backend.config import settings  # noqa: E402
from volunteer_assistance.backend.database import Base, SessionLocal, engine, run_migrations  # noqa: E402
from volunteer_assistance.backend.gmail_sender import gmail_sender  # noqa: E402
from volunteer_assistance.backend.models import FamilyEvent, FamilyLink, SOSAlert  # noqa: E402
from volunteer_assistance.backend.telegram_bot import telegram_bot  # noqa: E402


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _pb_varint(val: int) -> bytes:
    out = bytearray()
    v = int(val)
    while v >= 0x80:
        out.append((v & 0x7F) | 0x80)
        v >>= 7
    out.append(v & 0x7F)
    return bytes(out)


def _pb_field_varint(field_no: int, val: int) -> bytes:
    return _pb_varint((field_no << 3) | 0) + _pb_varint(val)


def _pb_field_bytes(field_no: int, payload: bytes) -> bytes:
    return _pb_varint((field_no << 3) | 2) + _pb_varint(len(payload)) + payload


def _pb_field_str(field_no: int, text: str) -> bytes:
    return _pb_field_bytes(field_no, text.encode("utf-8"))


def _pb_field_float(field_no: int, val: float) -> bytes:
    return _pb_varint((field_no << 3) | 5) + struct.pack("<f", val)


def _build_sample_gtfs_rt_protobuf(arrival_epoch: int) -> bytes:
    trip_desc = _pb_field_str(1, "TRIP_707") + _pb_field_str(5, "707")
    arr_event = _pb_field_varint(2, arrival_epoch)
    stop_upd = _pb_field_bytes(2, arr_event) + _pb_field_str(4, "STOP_A")
    veh_desc = _pb_field_str(1, "VEH-707") + _pb_field_str(2, "KA-01-707")
    trip_upd = _pb_field_bytes(1, trip_desc) + _pb_field_bytes(2, stop_upd) + _pb_field_bytes(3, veh_desc)
    ent_tu = _pb_field_str(1, "e-tu") + _pb_field_bytes(3, trip_upd)

    pos_msg = _pb_field_float(1, 12.9781) + _pb_field_float(2, 77.5719) + _pb_field_float(3, 90.0)
    veh_pos = _pb_field_bytes(1, trip_desc) + _pb_field_bytes(2, pos_msg) + _pb_field_bytes(8, veh_desc)
    ent_vp = _pb_field_str(1, "e-vp") + _pb_field_bytes(4, veh_pos)

    header = _pb_field_str(1, "2.0")
    return _pb_field_bytes(1, header) + _pb_field_bytes(2, ent_tu) + _pb_field_bytes(2, ent_vp)


def _build_sample_gtfs_static_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("routes.txt", "route_id,route_short_name,route_long_name\n707,707,Central - Tech Park\n")
        zf.writestr("trips.txt", "route_id,service_id,trip_id,trip_headsign\n707,WD,TRIP_707,Tech Park Terminal\n")
        zf.writestr("stops.txt", "stop_id,stop_name,stop_lat,stop_lon\nSTOP_A,MG Road Metro Stop,12.9760,77.6060\n")
    return buf.getvalue()


class _FakeHttpResponse:
    def __init__(self, status_code=200, payload=None, content=None):
        self.status_code = status_code
        self._payload = payload or {}
        self.content = content if content is not None else json.dumps(self._payload).encode("utf-8")

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


class TestVoiceAssistantAndHardware(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        run_migrations()

    async def asyncSetUp(self):
        self.transport = httpx.ASGITransport(app=unified_app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://testserver")
        self.suffix = uuid.uuid4().hex[:8]
        self.sent_emails = []
        self.sent_telegrams = []
        self._ip_seq = 1

        gmail_sender.set_transport_override(
            lambda to_email, subject, html, text: self.sent_emails.append({"to": to_email, "subject": subject, "text": text})
        )
        telegram_bot.set_sender_override(
            lambda chat_id, text, button_url=None: (self.sent_telegrams.append({"chat_id": chat_id, "text": text}) or True)
        )
        bus_service.clear_cache()

    async def asyncTearDown(self):
        gmail_sender.set_transport_override(None)
        telegram_bot.set_sender_override(None)
        await self.client.aclose()

    async def _register_user(self, *, role="blind_user", full_name="Priya Blind"):
        import re

        self._ip_seq += 1
        ip_hdr = {"X-Forwarded-For": f"10.88.1.{self._ip_seq}"}
        uname = f"{role}_{self.suffix}_{uuid.uuid4().hex[:4]}"
        email = f"{uname}@example.com"
        res = await self.client.post(
            "/api/auth/register",
            headers=ip_hdr,
            json={
                "username": uname,
                "password": "password123",
                "full_name": full_name,
                "role": role,
                "email": email,
            },
        )
        self.assertEqual(res.status_code, 201, res.text)
        token = res.json()["access_token"]
        headers = {**ip_hdr, "Authorization": f"Bearer {token}"}

        otp = ""
        for mail in reversed(self.sent_emails):
            if mail["to"].lower() == email.lower():
                m = re.search(r"(\d{6})", mail["subject"]) or re.search(r"verification code is:\s*(\d{6})", mail["text"])
                if m:
                    otp = m.group(1)
                    break
        self.assertTrue(otp, f"Expected OTP email for {email}")
        v = await self.client.post("/api/auth/email/verify", json={"email": email, "code": otp}, headers=headers)
        self.assertEqual(v.status_code, 200, v.text)
        final_token = v.json().get("access_token") or token
        final_headers = {**ip_hdr, "Authorization": f"Bearer {final_token}"}

        return {
            "id": v.json()["user_id"],
            "username": uname,
            "email": email,
            "headers": final_headers,
            "raw": v.json(),
        }

    # ── 1. Hardware Button WebSocket & Headless SOS ────────────────────────────
    async def test_websocket_hardware_button_relay_and_token_guard(self):
        port = _find_free_port()
        config = uvicorn.Config(unified_app, host="127.0.0.1", port=port, log_level="warning")
        server = uvicorn.Server(config)
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()

        for _ in range(40):
            try:
                async with httpx.AsyncClient() as probe:
                    r = await probe.get(f"http://127.0.0.1:{port}/api/health")
                    if r.status_code == 200:
                        break
            except Exception:
                await asyncio.sleep(0.1)

        orig_token = settings.HARDWARE_BUTTON_TOKEN
        try:
            settings.HARDWARE_BUTTON_TOKEN = "secret-hw-token"
            # Bad token fails handshake
            with self.assertRaises(Exception):
                async with websockets.connect(f"ws://127.0.0.1:{port}/ws/hardware?device_id=esp-bad&token=wrong"):
                    pass

            client_id = f"test-client-{self.suffix}"
            async with websockets.connect(f"ws://127.0.0.1:{port}/ws/assistant/{client_id}") as ui_ws:
                ui_welcome = json.loads(await asyncio.wait_for(ui_ws.recv(), timeout=3))
                self.assertEqual(ui_welcome["type"], "ASSISTANT_WS_CONNECTED")

                async with websockets.connect(
                    f"ws://127.0.0.1:{port}/ws/hardware?device_id=esp32-btn-1&token=secret-hw-token"
                ) as hw_ws:
                    welcome = json.loads(await asyncio.wait_for(hw_ws.recv(), timeout=3))
                    self.assertEqual(welcome["type"], "HARDWARE_CONNECTED")
                    for act in ("single_press", "cancel", "long_press"):
                        await hw_ws.send(json.dumps({"action": act, "source": "esp32_ws"}))
                        ack = json.loads(await asyncio.wait_for(hw_ws.recv(), timeout=3))
                        self.assertEqual(ack["type"], "HARDWARE_ACK")
                        self.assertEqual(ack["action"], act)

                        ui_evt = json.loads(await asyncio.wait_for(ui_ws.recv(), timeout=3))
                        self.assertEqual(ui_evt["type"], "HARDWARE_BUTTON_EVENT")
                        self.assertEqual(ui_evt["action"], act)
                        self.assertEqual(ui_evt["device_id"], "esp32-btn-1")
        finally:
            settings.HARDWARE_BUTTON_TOKEN = orig_token
            server.should_exit = True
            thread.join(timeout=4)

    async def test_headless_long_press_triggers_direct_backend_sos_and_alerts(self):
        blind = await self._register_user(role="blind_user", full_name="Asha SOS")
        fam = await self._register_user(role="family", full_name="Ravi Guardian")
        self.sent_emails.clear()
        self.sent_telegrams.clear()

        db = SessionLocal()
        try:
            db.add(
                FamilyLink(
                    blind_user_id=blind["id"],
                    family_user_id=fam["id"],
                    invite_code=f"FAM-{self.suffix}",
                    relationship_label="Brother",
                    status="approved",
                    receive_sos=True,
                )
            )
            db.commit()
        finally:
            db.close()

        # No WS subscribers connected -> HTTP/hardware long press fires backend SOS immediately
        res = await self.client.post(
            "/api/hardware/button-event",
            json={
                "action": "long_press",
                "device_id": "esp32-headless",
                "user_id": blind["id"],
                "latitude": 12.9716,
                "longitude": 77.5946,
            },
        )
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(body["action"], "long_press")
        self.assertIsNotNone(body["backend_sos_alert_id"])
        self.assertGreaterEqual(len(self.sent_emails), 1)

        db = SessionLocal()
        try:
            alert = db.query(SOSAlert).filter(SOSAlert.id == body["backend_sos_alert_id"]).first()
            self.assertIsNotNone(alert)
            self.assertEqual(alert.source, "hardware_long_press")
            self.assertTrue(alert.active)
        finally:
            db.close()

    # ── 2. Pluggable Bus Providers: Mock 400, GTFS-RT Protobuf + Cache, No-Data Fallback ──
    async def test_bus_mock_route_400_cache_and_unknown_city_fallback(self):
        orig_mode = settings.BUS_PROVIDER_MODE
        orig_mock = settings.BUS_MOCK_ENABLED
        try:
            settings.BUS_PROVIDER_MODE = "auto"
            settings.BUS_MOCK_ENABLED = True
            bus_service.clear_cache()

            r1 = await self.client.get("/api/bus/arrivals?route=400&latitude=12.9778&longitude=77.5713")
            self.assertEqual(r1.status_code, 200, r1.text)
            d1 = r1.json()
            self.assertTrue(d1["has_data"])
            self.assertEqual(d1["route_number"], "400")
            self.assertFalse(d1["cached"])
            self.assertIn("Central Stop", d1["spoken_summary"])
            self.assertIn("6 minutes", d1["spoken_summary"])
            self.assertIn("Airport", d1["spoken_summary"])

            # 2nd request within TTL hits short cache
            r2 = await self.client.get("/api/bus/arrivals?route=400&latitude=12.9778&longitude=77.5713")
            self.assertEqual(r2.status_code, 200)
            self.assertTrue(r2.json()["cached"])

            # Unknown city/route -> honest response offering volunteer or nearest stop walk
            r3 = await self.client.get("/api/bus/arrivals?route=999&city=Atlantis&latitude=12.9778&longitude=77.5713")
            self.assertEqual(r3.status_code, 200)
            d3 = r3.json()
            self.assertFalse(d3["has_data"])
            self.assertIn("volunteer", d3["spoken_summary"].lower())
            self.assertIn("stop", d3["spoken_summary"].lower())
            self.assertEqual(d3["suggestion"], "offer_volunteer_or_walk_to_stop")
        finally:
            settings.BUS_PROVIDER_MODE = orig_mode
            settings.BUS_MOCK_ENABLED = orig_mock

    async def test_gtfs_protobuf_and_json_realtime_adapter(self):
        arr_ts = int(time.time()) + 300  # ~5 minutes ahead
        pb_bytes = _build_sample_gtfs_rt_protobuf(arr_ts)
        parsed = parse_gtfs_rt_feed(pb_bytes)
        self.assertEqual(parsed["format"], "protobuf")
        self.assertEqual(len(parsed["entities"]), 2)
        self.assertEqual(parsed["entities"][0]["trip_update"]["trip"]["route_id"], "707")
        self.assertEqual(parsed["entities"][0]["trip_update"]["stop_time_update"][0]["stop_id"], "STOP_A")

        static_zip = _build_sample_gtfs_static_zip()
        orig_static = settings.GTFS_STATIC_ZIP_URL
        orig_tu = settings.GTFS_RT_TRIP_UPDATES_URL
        orig_vp = settings.GTFS_RT_VEHICLE_POSITIONS_URL
        try:
            settings.GTFS_STATIC_ZIP_URL = "https://example.org/gtfs.zip"
            settings.GTFS_RT_TRIP_UPDATES_URL = "https://example.org/trip_updates.pb"
            settings.GTFS_RT_VEHICLE_POSITIONS_URL = "https://example.org/vehicle_positions.pb"

            def _fake_requests_get(url, headers=None, timeout=12):
                if "gtfs.zip" in url:
                    return _FakeHttpResponse(200, content=static_zip)
                return _FakeHttpResponse(200, content=pb_bytes)

            provider = GTFSBusProvider()
            with patch("volunteer_assistance.backend.bus_service.requests.get", side_effect=_fake_requests_get):
                res = await provider.lookup_route("707", 12.9760, 77.6060)

            self.assertIsNotNone(res)
            self.assertTrue(res["has_data"])
            self.assertEqual(res["provider"], "gtfs")
            self.assertEqual(res["arrivals"][0]["stop_name"], "MG Road Metro Stop")
            self.assertEqual(res["arrivals"][0]["direction"], "Tech Park Terminal")
            self.assertIn("MG Road Metro Stop", res["spoken_summary"])
        finally:
            settings.GTFS_STATIC_ZIP_URL = orig_static
            settings.GTFS_RT_TRIP_UPDATES_URL = orig_tu
            settings.GTFS_RT_VEHICLE_POSITIONS_URL = orig_vp

    # ── 3. Command Logs & Optional LLM Parse Endpoint ─────────────────────────
    async def test_assistant_command_logs_and_optional_llm_parse(self):
        cid = f"client-{self.suffix}"
        c_res = await self.client.post(
            "/api/assistant/logs",
            json={
                "client_id": cid,
                "transcript": "check bus number 400",
                "intent": "BUS_INFO",
                "result": "Bus 400 arrives in 6 minutes",
                "status": "executed",
                "source": "voice",
            },
        )
        self.assertEqual(c_res.status_code, 200, c_res.text)

        l_res = await self.client.get(f"/api/assistant/logs?client_id={cid}")
        self.assertEqual(l_res.status_code, 200)
        self.assertEqual(len(l_res.json()), 1)
        self.assertEqual(l_res.json()[0]["intent"], "BUS_INFO")

        d_res = await self.client.delete(f"/api/assistant/logs?client_id={cid}")
        self.assertEqual(d_res.status_code, 200)
        self.assertEqual(d_res.json()["deleted_count"], 1)

        l_after = await self.client.get(f"/api/assistant/logs?client_id={cid}")
        self.assertEqual(len(l_after.json()), 0)

        # LLM disabled cleanly when unconfigured
        orig_key = settings.LLM_API_KEY
        orig_url = settings.LLM_API_URL
        try:
            settings.LLM_API_KEY = ""
            llm_off = await self.client.post("/api/assistant/parse-llm", json={"transcript": "help me walk home"})
            self.assertEqual(llm_off.status_code, 200)
            self.assertFalse(llm_off.json()["enabled"])

            settings.LLM_API_KEY = "test-llm-key"
            settings.LLM_API_URL = "https://api.openai.com/v1/chat/completions"

            class _MockAsyncClient:
                def __init__(self, *a, **kw):
                    pass

                async def __aenter__(self):
                    return self

                async def __aexit__(self, *a):
                    return False

                async def post(self, *a, **kw):
                    return _FakeHttpResponse(
                        200,
                        payload={
                            "choices": [
                                {
                                    "message": {
                                        "content": json.dumps({
                                            "intent": "NAVIGATION",
                                            "place": "Indiranagar Metro",
                                            "routeNumber": None,
                                            "confidence": 0.91,
                                        })
                                    }
                                }
                            ]
                        },
                    )

            with patch("volunteer_assistance.backend.routes.assistant_routes.httpx.AsyncClient", _MockAsyncClient):
                llm_on = await self.client.post("/api/assistant/parse-llm", json={"transcript": "take me over to indiranagar metro"})
            self.assertEqual(llm_on.status_code, 200)
            self.assertTrue(llm_on.json()["enabled"])
            self.assertEqual(llm_on.json()["intent"], "NAVIGATION")
            self.assertEqual(llm_on.json()["place"], "Indiranagar Metro")
        finally:
            settings.LLM_API_KEY = orig_key
            settings.LLM_API_URL = orig_url

    # ── 4. Family Check-in Alert & Consent-Gated Navigation Timeline Events ───
    async def test_family_checkin_alert_and_navigation_consent_timeline(self):
        blind = await self._register_user(role="blind_user", full_name="Meena Walker")
        fam = await self._register_user(role="family", full_name="Kiran Guardian")
        self.sent_emails.clear()
        self.sent_telegrams.clear()

        db = SessionLocal()
        try:
            db.add(
                FamilyLink(
                    blind_user_id=blind["id"],
                    family_user_id=fam["id"],
                    invite_code=f"NAV-{self.suffix}",
                    relationship_label="Son",
                    status="approved",
                    receive_sos=True,
                )
            )
            db.commit()
        finally:
            db.close()

        # Check-in without consent still notifies emergency guardians (urgent family request)
        chk = await self.client.post(
            "/api/family/check-in-alert",
            headers=blind["headers"],
            json={"action_type": "send_location", "latitude": 12.9716, "longitude": 77.5946},
        )
        self.assertEqual(chk.status_code, 200, chk.text)
        self.assertGreaterEqual(len(self.sent_emails), 1)

        # Navigation timeline WITHOUT sharing consent -> shared=False (privacy respected)
        nav_blocked = await self.client.post(
            "/api/family/navigation-event",
            headers=blind["headers"],
            json={"status": "started", "destination_name": "Gandhi Road", "distance_text": "450 m"},
        )
        self.assertEqual(nav_blocked.status_code, 200)
        self.assertFalse(nav_blocked.json()["shared"])

        # Enable sharing consent -> timeline records navigation started + arrived safely
        consent = await self.client.post(
            "/api/family/sharing/consent",
            headers=blind["headers"],
            json={"consent_given": True, "is_sharing": True, "is_paused": False},
        )
        self.assertEqual(consent.status_code, 200)

        nav_start = await self.client.post(
            "/api/family/navigation-event",
            headers=blind["headers"],
            json={"status": "started", "destination_name": "Gandhi Road", "distance_text": "450 m"},
        )
        self.assertEqual(nav_start.status_code, 200)
        self.assertTrue(nav_start.json()["shared"])

        nav_arrived = await self.client.post(
            "/api/family/navigation-event",
            headers=blind["headers"],
            json={"status": "arrived", "destination_name": "Gandhi Road"},
        )
        self.assertEqual(nav_arrived.status_code, 200)
        self.assertTrue(nav_arrived.json()["shared"])

        db = SessionLocal()
        try:
            events = db.query(FamilyEvent).filter(FamilyEvent.blind_user_id == blind["id"]).all()
            types = [e.event_type for e in events]
            self.assertIn("NAVIGATION_STARTED", types)
            self.assertIn("NAVIGATION_ARRIVED", types)
        finally:
            db.close()

    # ── 5. Free Geocode Multi-Match & Routing Endpoint ────────────────────────
    async def test_geocode_and_walking_route_endpoints(self):
        class _MockGeoClient:
            def __init__(self, *a, **kw):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def get(self, url, params=None):
                if "search" in url:
                    return _FakeHttpResponse(
                        200,
                        payload=[
                            {
                                "name": "City Hospital",
                                "display_name": "City Hospital, Main Road, Bengaluru",
                                "lat": "12.9780",
                                "lon": "77.5720",
                                "address": {"road": "Main Road"},
                            },
                            {
                                "name": "City Hospital Annex",
                                "display_name": "City Hospital Annex, Gandhi Road, Bengaluru",
                                "lat": "12.9890",
                                "lon": "77.5900",
                                "address": {"road": "Gandhi Road"},
                            },
                        ],
                    )
                return _FakeHttpResponse(
                    200,
                    payload={
                        "routes": [
                            {
                                "distance": 320,
                                "duration": 260,
                                "geometry": {"coordinates": [[77.5713, 12.9778], [77.5720, 12.9780]]},
                                "legs": [
                                    {
                                        "steps": [
                                            {
                                                "distance": 50,
                                                "duration": 40,
                                                "name": "Gandhi Road",
                                                "maneuver": {"type": "turn", "modifier": "left", "location": [77.5715, 12.9779]},
                                            }
                                        ]
                                    }
                                ],
                            }
                        ]
                    },
                )

        with patch("volunteer_assistance.backend.routes.assistant_routes.httpx.AsyncClient", _MockGeoClient):
            g_res = await self.client.get("/api/assistant/geocode?q=City+Hospital&lat=12.9778&lng=77.5713")
            self.assertEqual(g_res.status_code, 200, g_res.text)
            matches = g_res.json()["matches"]
            self.assertEqual(len(matches), 2)
            self.assertEqual(matches[0]["street"], "Main Road")

            r_res = await self.client.get(
                "/api/assistant/route?from_lat=12.9778&from_lng=77.5713&to_lat=12.9780&to_lng=77.5720"
            )
            self.assertEqual(r_res.status_code, 200, r_res.text)
            self.assertEqual(r_res.json()["distance_m"], 320)
            self.assertEqual(r_res.json()["steps"][0]["road"], "Gandhi Road")

    # ── 6. ESP32-CAM Config, Proxy Capture, LAN Discovery & Detections ────────
    async def test_esp32_cam_config_proxy_capture_discover_and_detections(self):
        from http.server import BaseHTTPRequestHandler, HTTPServer
        from volunteer_assistance.backend.routes.stick_routes import vision_config_state

        sample_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"

        class _CamHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path.startswith("/capture"):
                    self.send_response(200)
                    self.send_header("Content-Type", "image/jpeg")
                    self.send_header("Content-Length", str(len(sample_jpeg)))
                    self.end_headers()
                    self.wfile.write(sample_jpeg)
                else:
                    self.send_response(404)
                    self.end_headers()

            def log_message(self, format, *args):
                pass

        server = HTTPServer(("127.0.0.1", 0), _CamHandler)
        cam_port = server.server_address[1]
        cam_url = f"http://127.0.0.1:{cam_port}/capture"
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        orig_url = vision_config_state.get("camera_url")
        orig_conn = vision_config_state.get("camera_connected")
        try:
            # 1. Save & probe live camera config
            cfg_res = await self.client.post(
                "/api/vision/config",
                json={"camera_url": cam_url, "probe": True},
            )
            self.assertEqual(cfg_res.status_code, 200, cfg_res.text)
            self.assertTrue(cfg_res.json()["camera_connected"])
            self.assertEqual(cfg_res.json()["camera_url"], cam_url)

            # 2. Same-origin JPEG snapshot proxy
            cap_res = await self.client.get("/api/vision/capture")
            self.assertEqual(cap_res.status_code, 200, cap_res.text)
            self.assertEqual(cap_res.headers.get("content-type"), "image/jpeg")
            self.assertEqual(cap_res.content, sample_jpeg)

            # 3. Auto-discovery detects configured live ESP32-CAM immediately
            disc_res = await self.client.post("/api/vision/discover?scan_lan=false")
            self.assertEqual(disc_res.status_code, 200, disc_res.text)
            self.assertTrue(disc_res.json()["found"])
            self.assertEqual(disc_res.json()["camera_url"], cam_url)

            # 4. Detections push + status reflection
            det_res = await self.client.post(
                "/api/vision/detections",
                json={"detector": "yolov8n", "detections": [{"id": "d1", "label": "chair", "confidence": 88}]},
            )
            self.assertEqual(det_res.status_code, 200, det_res.text)
            st_res = await self.client.get("/api/vision/status")
            self.assertEqual(st_res.status_code, 200)
            self.assertTrue(st_res.json()["connected"])
            self.assertTrue(st_res.json()["camera_connected"])
            self.assertEqual(st_res.json()["detection_count"], 1)
        finally:
            server.shutdown()
            server.server_close()
            vision_config_state["camera_url"] = orig_url
            vision_config_state["camera_connected"] = orig_conn


if __name__ == "__main__":
    unittest.main()
