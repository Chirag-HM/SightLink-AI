import sys
import unittest
import uuid
from pathlib import Path

import httpx

ROOT_DIR = Path(__file__).resolve().parents[4]
ESP_CAM_DIR = ROOT_DIR / "ESP32_CAM_Test"
for p in (str(ROOT_DIR), str(ESP_CAM_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from main import app as unified_app  # noqa: E402
from volunteer_assistance.backend.database import Base, engine, run_migrations  # noqa: E402
from volunteer_assistance.backend.config import settings  # noqa: E402


class TestExtendedAssistanceAndFamilyFlows(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        run_migrations()

    async def asyncSetUp(self):
        self.transport = httpx.ASGITransport(app=unified_app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://testserver")
        self.suffix = uuid.uuid4().hex[:8]

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_bmtc_root_and_health_preserved(self):
        r_root = await self.client.get("/")
        self.assertEqual(r_root.status_code, 200)
        self.assertIn("BMTC Bus Tracking API", r_root.json()["message"])

        r_health = await self.client.get("/api/health")
        self.assertEqual(r_health.status_code, 200)
        self.assertEqual(r_health.json()["status"], "healthy")

    async def test_volunteer_verification_escalation_accept_rate_and_cancel(self):
        # 1. Register blind user
        blind_username = f"blind_{self.suffix}"
        r_blind = await self.client.post("/api/auth/register", json={
            "username": blind_username,
            "password": "password123",
            "full_name": "Kiran Rao",
            "role": "blind_user",
        })
        self.assertEqual(r_blind.status_code, 201, r_blind.text)
        blind_headers = {"Authorization": f"Bearer {r_blind.json()['access_token']}"}
        blind_id = r_blind.json()["user_id"]

        # 2. Voice login endpoint check
        r_voice = await self.client.post("/api/auth/voice-login", json={
            "spoken_phrase": f"login as {blind_username}",
            "username": blind_username,
            "passcode": "password123",
        })
        self.assertEqual(r_voice.status_code, 200, r_voice.text)
        self.assertEqual(r_voice.json()["user_id"], blind_id)

        # 3. Volunteer signup via Phone OTP verification -> must get verified badge
        vol_phone = f"+919900{self.suffix[:6]}"
        r_otp = await self.client.post("/api/auth/request-otp", json={"phone_number": vol_phone})
        self.assertEqual(r_otp.status_code, 200)
        otp_code = r_otp.json()["demo_otp"]

        r_vol1 = await self.client.post("/api/auth/register", json={
            "username": f"rahul_vol_{self.suffix}",
            "password": "password123",
            "full_name": "Rahul Verma",
            "phone_number": vol_phone,
            "role": "volunteer",
            "verification_method": "phone",
            "verification_code": otp_code,
        })
        self.assertEqual(r_vol1.status_code, 201, r_vol1.text)
        self.assertTrue(r_vol1.json()["is_verified"])
        vol1_headers = {"Authorization": f"Bearer {r_vol1.json()['access_token']}"}

        # Volunteer off-duty location sharing must be blocked (403)
        r_off_loc = await self.client.put("/api/volunteer/location", json={
            "latitude": 12.9718,
            "longitude": 77.5948,
        }, headers=vol1_headers)
        self.assertEqual(r_off_loc.status_code, 403)

        # Go on duty & set location ~2km away (outside initial 500m, inside 3km)
        r_on = await self.client.put("/api/volunteer/availability", json={"is_available": True}, headers=vol1_headers)
        self.assertEqual(r_on.status_code, 200)
        self.assertEqual(r_on.json()["duty_state"], "on_duty")

        # Put volunteer ~1.8 km away from 12.9716, 77.5946
        r_loc = await self.client.put("/api/volunteer/location", json={
            "latitude": 12.9878,
            "longitude": 77.5946,
            "share_consent": True,
        }, headers=vol1_headers)
        self.assertEqual(r_loc.status_code, 200)

        # 4. Blind user creates help request -> default radius is 500m (0.5 km)
        r_req = await self.client.post("/api/assistance/request", json={
            "latitude": 12.9716,
            "longitude": 77.5946,
            "assistance_type": "crossing road",
        }, headers=blind_headers)
        self.assertEqual(r_req.status_code, 200, r_req.text)
        req_id = r_req.json()["request_id"]
        self.assertAlmostEqual(r_req.json()["radius_km"], 0.5)
        self.assertEqual(r_req.json()["escalation_stage"], 0)

        # Escalate Step 1 -> 1 km
        r_esc1 = await self.client.post(f"/api/assistance/{req_id}/escalate", headers=blind_headers)
        self.assertEqual(r_esc1.status_code, 200)
        self.assertEqual(r_esc1.json()["stage"], 1)
        self.assertAlmostEqual(r_esc1.json()["radius_km"], 1.0)

        # Escalate Step 2 -> 3 km (now reaches volunteer at 1.8 km)
        r_esc2 = await self.client.post(f"/api/assistance/{req_id}/escalate", headers=blind_headers)
        self.assertEqual(r_esc2.status_code, 200)
        self.assertEqual(r_esc2.json()["stage"], 2)
        self.assertAlmostEqual(r_esc2.json()["radius_km"], 3.0)

        # Volunteer sees pending request with verified / ETA / lat / lng / userId / type / createdAt
        r_pend = await self.client.get("/api/volunteer/pending-requests", headers=vol1_headers)
        self.assertEqual(r_pend.status_code, 200)
        matching = [p for p in r_pend.json() if p["id"] == req_id]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]["userId"], blind_id)
        self.assertEqual(matching[0]["type"], "crossing road")

        # Volunteer accepts -> returns full info + verified volunteer badge
        r_acc = await self.client.post(f"/api/assistance/{req_id}/accept", headers=vol1_headers)
        self.assertEqual(r_acc.status_code, 200, r_acc.text)
        self.assertEqual(r_acc.json()["status"], "ACCEPTED")
        self.assertTrue(r_acc.json()["accepted_volunteer"]["is_verified"])

        # Blind user active request checks live fields & timeline
        r_act = await self.client.get("/api/assistance/active", headers=blind_headers)
        self.assertEqual(r_act.status_code, 200)
        self.assertEqual(r_act.json()["status"], "ACCEPTED")

        # Volunteer marks arrived -> completed -> blind user submits rating 5
        self.assertEqual((await self.client.post(f"/api/assistance/{req_id}/arrived", headers=vol1_headers)).status_code, 200)
        self.assertEqual((await self.client.post(f"/api/assistance/{req_id}/complete", headers=vol1_headers)).status_code, 200)
        r_rate = await self.client.post(f"/api/assistance/{req_id}/rate", json={"rating": 5, "comment": "Very helpful"}, headers=blind_headers)
        self.assertEqual(r_rate.status_code, 200)
        self.assertEqual(r_rate.json()["rating"], 5)

        # Volunteer history includes completed request
        r_hist = await self.client.get("/api/volunteer/history", headers=vol1_headers)
        self.assertEqual(r_hist.status_code, 200)
        self.assertTrue(any(h["id"] == req_id and h["rating"] == 5 for h in r_hist.json()))

        # Escalate Step 3 test (family + SOS) + Cancel flow on a new request
        r_req2 = await self.client.post("/api/assistance/request", json={
            "latitude": 12.9716,
            "longitude": 77.5946,
            "assistance_type": "navigation",
        }, headers=blind_headers)
        req2_id = r_req2.json()["request_id"]
        for _ in range(3):
            r_esc = await self.client.post(f"/api/assistance/{req2_id}/escalate", headers=blind_headers)
        self.assertEqual(r_esc.json()["stage"], 3)

        r_can = await self.client.post(f"/api/assistance/{req2_id}/cancel", json={"reason": "No longer needed"}, headers=blind_headers)
        self.assertEqual(r_can.status_code, 200)

        # Anti-abuse rate limiting check (create & cancel until RATE_LIMIT_MAX_REQUESTS reached)
        original_limit = settings.RATE_LIMIT_MAX_REQUESTS
        settings.RATE_LIMIT_MAX_REQUESTS = 2
        try:
            r_lim = await self.client.post("/api/assistance/request", json={
                "latitude": 12.9716,
                "longitude": 77.5946,
                "assistance_type": "other",
            }, headers=blind_headers)
            self.assertEqual(r_lim.status_code, 429)
        finally:
            settings.RATE_LIMIT_MAX_REQUESTS = original_limit

        # Report & block volunteer excludes future requests
        r_rep = await self.client.post("/api/safety/report", json={
            "reported_user_id": r_vol1.json()["user_id"],
            "request_id": req_id,
            "reason": "Testing block filter",
            "block_user": True,
        }, headers=blind_headers)
        self.assertEqual(r_rep.status_code, 200)
        self.assertTrue(r_rep.json()["blocked"])

    async def test_family_consent_geofence_pause_stop_and_sos(self):
        # 1. Register blind user -> gets family share session + invite code
        r_blind = await self.client.post("/api/auth/register", json={
            "username": f"fam_user_{self.suffix}",
            "password": "password123",
            "full_name": "Meera Nair",
            "role": "blind_user",
        })
        self.assertEqual(r_blind.status_code, 201)
        blind_headers = {"Authorization": f"Bearer {r_blind.json()['access_token']}"}

        r_share = await self.client.get("/api/family/sharing", headers=blind_headers)
        self.assertEqual(r_share.status_code, 200)
        invite_code = r_share.json()["invite_code"]
        self.assertFalse(r_share.json()["is_sharing"])

        # Cannot enable sharing without explicit consent
        r_no_consent = await self.client.post("/api/family/sharing/consent", json={
            "consent_given": False,
            "is_sharing": True,
        }, headers=blind_headers)
        self.assertEqual(r_no_consent.status_code, 400)

        # Grant consent & start sharing
        r_consent = await self.client.post("/api/family/sharing/consent", json={
            "consent_given": True,
            "is_sharing": True,
            "is_paused": False,
        }, headers=blind_headers)
        self.assertEqual(r_consent.status_code, 200)
        self.assertTrue(r_consent.json()["is_sharing"])

        # Save Safe Zone centered at 12.9716, 77.5946 radius 200m
        r_zone = await self.client.put("/api/family/sharing/safe-zone", json={
            "safe_zone_name": "Home",
            "safe_zone_lat": 12.9716,
            "safe_zone_lng": 77.5946,
            "safe_zone_radius_m": 200.0,
        }, headers=blind_headers)
        self.assertEqual(r_zone.status_code, 200)

        # Inside safe zone telemetry
        r_t1 = await self.client.post("/api/family/location", json={
            "latitude": 12.9716,
            "longitude": 77.5946,
            "battery_level": 84,
        }, headers=blind_headers)
        self.assertEqual(r_t1.status_code, 200)
        self.assertTrue(r_t1.json()["inside_safe_zone"])
        self.assertFalse(r_t1.json()["geofence_breached"])

        # Move outside safe zone (~1 km away) -> triggers geofence breach alert!
        r_t2 = await self.client.post("/api/family/location", json={
            "latitude": 12.9816,
            "longitude": 77.5946,
            "battery_level": 81,
        }, headers=blind_headers)
        self.assertEqual(r_t2.status_code, 200)
        self.assertFalse(r_t2.json()["inside_safe_zone"])
        self.assertTrue(r_t2.json()["geofence_breached"])

        # Trigger SOS
        r_sos = await self.client.post("/api/safety/sos", json={
            "latitude": 12.9816,
            "longitude": 77.5946,
            "notes": "Test SOS alert",
        }, headers=blind_headers)
        self.assertEqual(r_sos.status_code, 200)

        # Family read-only tracking view sees trail, battery=81, safe_zone, sos_active=True
        r_track = await self.client.get(f"/api/family/track/{invite_code}")
        self.assertEqual(r_track.status_code, 200)
        track = r_track.json()
        self.assertEqual(track["sharing_status"], "live")
        self.assertTrue(track["read_only"])
        self.assertEqual(track["battery_level"], 81)
        self.assertGreaterEqual(len(track["trail"]), 2)
        self.assertTrue(track["sos_active"])

        # Pause sharing -> current_location and trail hidden while paused
        await self.client.post("/api/family/sharing/consent", json={
            "consent_given": True,
            "is_sharing": True,
            "is_paused": True,
        }, headers=blind_headers)
        r_paused = await self.client.get(f"/api/family/track/{invite_code}")
        self.assertEqual(r_paused.json()["sharing_status"], "paused")
        self.assertIsNone(r_paused.json()["current_location"])
        self.assertEqual(r_paused.json()["trail"], [])

        # Stop sharing & resolve SOS
        await self.client.post("/api/safety/sos/resolve", headers=blind_headers)
        await self.client.post("/api/family/sharing/consent", json={
            "consent_given": False,
            "is_sharing": False,
        }, headers=blind_headers)
        r_stopped = await self.client.get(f"/api/family/track/{invite_code}")
        self.assertEqual(r_stopped.json()["sharing_status"], "stopped")
        self.assertFalse(r_stopped.json()["is_sharing"])


if __name__ == "__main__":
    unittest.main()

