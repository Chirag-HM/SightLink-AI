import asyncio
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

ROOT_DIR = Path(__file__).resolve().parents[4]
ESP_CAM_DIR = ROOT_DIR / "ESP32_CAM_Test"
for p in (str(ROOT_DIR), str(ESP_CAM_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from main import app as unified_app  # noqa: E402
from volunteer_assistance.backend.database import Base, SessionLocal, engine, run_migrations  # noqa: E402
from volunteer_assistance.backend.family_events import prune_expired_location_history  # noqa: E402
from volunteer_assistance.backend.models import (  # noqa: E402
    AssistanceRequest,
    FamilyEvent,
    FamilyShareSession,
    LiveAssistStatus,
    LocationBreadcrumb,
)


class TestEyesOnDemandAndCalmFamily(unittest.IsolatedAsyncioTestCase):
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

    async def _register_user(self, *, role: str, full_name: str, verify: bool = True, phone: str = None, invite_code: str = None):
        uname = f"{role}_{self.suffix}_{uuid.uuid4().hex[:4]}"
        payload = {
            "username": uname,
            "password": "password123",
            "full_name": full_name,
            "role": role,
        }
        if role == "volunteer" and verify:
            payload["verification_method"] = "id"
            payload["id_number"] = f"GOV-ID-{uuid.uuid4().hex[:6]}"
        if phone:
            payload["phone_number"] = phone
        if invite_code:
            payload["invite_code"] = invite_code

        res = await self.client.post("/api/auth/register", json=payload)
        self.assertEqual(res.status_code, 201, res.text)
        data = res.json()
        return {
            "id": data["user_id"],
            "username": uname,
            "headers": {"Authorization": f"Bearer {data['access_token']}"},
            "raw": data,
        }

    async def test_eyes_on_demand_full_lifecycle(self):
        blind = await self._register_user(role="blind_user", full_name="Lakshmi Devi")
        unverified_vol = await self._register_user(role="volunteer", full_name="Unverified Bob", verify=False)
        vol1 = await self._register_user(role="volunteer", full_name="Asha Nair", verify=True)
        vol2 = await self._register_user(role="volunteer", full_name="Vikram Rao", verify=True)

        # Verify volunteers go On duty (vol1 nearby ~2 km, vol2 remote ~25 km away)
        for v, coords in ((vol1, (12.9890, 77.5946)), (vol2, (13.1960, 77.5946))):
            self.assertEqual(
                (await self.client.put("/api/volunteer/availability", json={"is_available": True}, headers=v["headers"])).status_code,
                200,
            )
            self.assertEqual(
                (await self.client.put(
                    "/api/volunteer/location",
                    json={"latitude": coords[0], "longitude": coords[1], "share_consent": True},
                    headers=v["headers"],
                )).status_code,
                200,
            )

        # 1. Start Eyes on Demand session -> 1 km initial radius, 30s default, recording OFF
        r_sess1 = await self.client.post(
            "/api/live-assist/sessions",
            json={"latitude": 12.9716, "longitude": 77.5946, "allow_remote": True, "consent_confirmed": True},
            headers=blind["headers"],
        )
        self.assertEqual(r_sess1.status_code, 200, r_sess1.text)
        s1 = r_sess1.json()
        self.assertEqual(s1["status"], "waiting")
        self.assertEqual(s1["durationSec"], 30)
        self.assertAlmostEqual(s1["radius_km"], 1.0)
        self.assertFalse(s1["recording_enabled"])

        # 2. Unverified volunteer MUST be blocked (403)
        r_unv = await self.client.post(f"/api/live-assist/{s1['id']}/accept", headers=unverified_vol["headers"])
        self.assertEqual(r_unv.status_code, 403)

        # 3. Auto-widening radius progression: 1 km -> 3 km (15s) -> 10 km + remote (30s) -> 45s fallback
        esc1 = await self.client.post(f"/api/live-assist/{s1['id']}/escalate-radius", headers=blind["headers"])
        self.assertEqual(esc1.json()["stage"], 1)
        self.assertAlmostEqual(esc1.json()["radius_km"], 3.0)

        esc2 = await self.client.post(f"/api/live-assist/{s1['id']}/escalate-radius", headers=blind["headers"])
        self.assertEqual(esc2.json()["stage"], 2)
        self.assertAlmostEqual(esc2.json()["radius_km"], 10.0)

        esc3 = await self.client.post(f"/api/live-assist/{s1['id']}/escalate-radius", headers=blind["headers"])
        self.assertEqual(esc3.json()["stage"], 3)

        # Family timeline should have recorded the urgent 45s no-join fallback
        tl = (await self.client.get("/api/family/my/timeline", headers=blind["headers"])).json()
        self.assertTrue(any(ev["event_type"] == "LIVE_ASSIST_NO_JOIN_FALLBACK" and ev["urgent"] for ev in tl))

        # End s1 safely so we can test concurrent atomic accept on s2
        self.assertEqual(
            (await self.client.post(f"/api/live-assist/{s1['id']}/end", json={"outcome": "cancelled"}, headers=blind["headers"])).status_code,
            200,
        )

        # 4. Concurrent atomic claim: vol1 and vol2 race to accept s2 -> only ONE gets 200, other gets 409 Already taken
        r_sess2 = await self.client.post(
            "/api/live-assist/sessions",
            json={"latitude": 12.9716, "longitude": 77.5946, "allow_remote": True, "consent_confirmed": True},
            headers=blind["headers"],
        )
        s2_id = r_sess2.json()["id"]

        res_a, res_b = await asyncio.gather(
            self.client.post(f"/api/live-assist/{s2_id}/accept", headers=vol1["headers"]),
            self.client.post(f"/api/live-assist/{s2_id}/accept", headers=vol2["headers"]),
        )
        statuses = sorted([res_a.status_code, res_b.status_code])
        self.assertEqual(statuses, [200, 409], f"Unexpected concurrent claim statuses: {res_a.text} | {res_b.text}")
        winner = vol1 if res_a.status_code == 200 else vol2
        winner_json = (res_a if res_a.status_code == 200 else res_b).json()
        self.assertEqual(winner_json["status"], "connected")
        self.assertTrue(winner_json["accepted_volunteer"]["is_verified"])

        # 5. Timer extend (+30s -> 60s), quick-reply prompt, flash toggle, and audio fallback
        r_ext = await self.client.post(f"/api/live-assist/{s2_id}/extend", json={"extra_seconds": 30}, headers=blind["headers"])
        self.assertEqual(r_ext.status_code, 200)
        self.assertEqual(r_ext.json()["duration_sec"], 60)

        r_qr = await self.client.post(
            f"/api/live-assist/{s2_id}/quick-reply",
            json={"prompt_text": "Wait, vehicle approaching"},
            headers=winner["headers"],
        )
        self.assertEqual(r_qr.status_code, 200)
        self.assertEqual(r_qr.json()["prompt_text"], "Wait, vehicle approaching")

        r_fl = await self.client.post(f"/api/live-assist/{s2_id}/flash", json={"flash_on": True}, headers=winner["headers"])
        self.assertEqual(r_fl.status_code, 200)
        self.assertTrue(r_fl.json()["flash_on"])

        r_af = await self.client.post(
            f"/api/live-assist/{s2_id}/audio-fallback",
            json={"reason": "High packet loss"},
            headers=blind["headers"],
        )
        self.assertEqual(r_af.status_code, 200)
        self.assertEqual(r_af.json()["connection_mode"], "audio_only")

        # 6. Escalate live video -> in-person AssistanceRequest carrying same location + status + "Someone is on the way."
        r_esc_ip = await self.client.post(f"/api/live-assist/{s2_id}/escalate", headers=winner["headers"])
        self.assertEqual(r_esc_ip.status_code, 200, r_esc_ip.text)
        esc_data = r_esc_ip.json()
        self.assertEqual(esc_data["status"], "escalated")
        self.assertEqual(esc_data["voice_announcement"], "Someone is on the way.")
        req_id = esc_data["assistance_request_id"]

        db = SessionLocal()
        try:
            in_person_req = db.query(AssistanceRequest).filter(AssistanceRequest.id == req_id).first()
            self.assertIsNotNone(in_person_req)
            self.assertAlmostEqual(in_person_req.latitude, 12.9716, places=4)
            self.assertAlmostEqual(in_person_req.longitude, 77.5946, places=4)
        finally:
            db.close()

        # 7. Rate escalated live assist session (5 stars) & verify history shows it
        r_rate = await self.client.post(
            f"/api/live-assist/{s2_id}/rate",
            json={"rating": 5, "comment": "Quick visual guide!"},
            headers=blind["headers"],
        )
        self.assertEqual(r_rate.status_code, 200)
        self.assertEqual(r_rate.json()["rating"], 5)

        r_vh = await self.client.get("/api/live-assist/history", headers=winner["headers"])
        self.assertEqual(r_vh.status_code, 200)
        self.assertTrue(any(item["id"] == s2_id and item["rating"] == 5 for item in r_vh.json()))

        # Cancel escalated in-person request and report/block winner -> pending check hides new session
        await self.client.post(f"/api/assistance/{req_id}/cancel", json={"reason": "Done"}, headers=blind["headers"])
        await self.client.post(
            "/api/safety/report",
            json={"reported_user_id": winner["id"], "reason": "Test block", "block_user": True},
            headers=blind["headers"],
        )
        r_sess3 = await self.client.post(
            "/api/live-assist/sessions",
            json={"latitude": 12.9716, "longitude": 77.5946, "allow_remote": True, "consent_confirmed": True},
            headers=blind["headers"],
        )
        s3_id = r_sess3.json()["id"]
        pend_after_block = (await self.client.get("/api/live-assist/pending", headers=winner["headers"])).json()
        self.assertFalse(any(item["id"] == s3_id for item in pend_after_block))

    async def test_calm_family_events_encryption_consent_and_retention(self):
        blind = await self._register_user(role="blind_user", full_name="Ramesh Sharma")
        fam = await self._register_user(role="family", full_name="Priya Sharma")

        # Enable sharing with explicit consent + Caregiver Mode indicator
        r_share = await self.client.get("/api/family/sharing", headers=blind["headers"])
        invite_code = r_share.json()["invite_code"]

        r_consent = await self.client.post(
            "/api/family/sharing/consent",
            json={
                "consent_given": True,
                "is_sharing": True,
                "caregiver_managed": True,
                "caregiver_name": "Priya",
            },
            headers=blind["headers"],
        )
        self.assertEqual(r_consent.status_code, 200)
        self.assertTrue(r_consent.json()["caregiver_managed"])

        # 1. Invite link accept -> requires user confirmation by voice/button
        r_link = await self.client.post(
            "/api/family/link",
            json={"invite_code": invite_code, "relationship_label": "Daughter"},
            headers=fam["headers"],
        )
        self.assertEqual(r_link.status_code, 200)
        self.assertTrue(r_link.json()["awaiting_user_confirmation"])

        r_wait = await self.client.get(f"/api/family/track/{invite_code}", headers=fam["headers"])
        self.assertTrue(r_wait.json()["awaiting_user_confirmation"])
        self.assertFalse(r_wait.json()["live_map_allowed"])

        # User confirms latest pending invite (voice/button endpoint)
        r_conf = await self.client.post("/api/family/members/confirm-latest", json={"approved": True}, headers=blind["headers"])
        self.assertEqual(r_conf.status_code, 200)
        self.assertEqual(r_conf.json()["status"], "approved")
        link_id = r_conf.json()["id"]

        # 2. Save Places (Home and Clinic ~2.5km north)
        self.assertEqual(
            (await self.client.post(
                "/api/family/saved-places",
                json={"name": "Home", "category": "home", "latitude": 12.9716, "longitude": 77.5946, "radius_m": 150},
                headers=blind["headers"],
            )).status_code,
            200,
        )
        self.assertEqual(
            (await self.client.post(
                "/api/family/saved-places",
                json={"name": "Clinic", "category": "clinic", "latitude": 12.9940, "longitude": 77.5946, "radius_m": 150},
                headers=blind["headers"],
            )).status_code,
            200,
        )

        # Build usual route corridor along corridor points (multiple hits learn the usual route)
        for _ in range(2):
            for lat_p in (12.9716, 12.9760, 12.9820, 12.9940):
                await self.client.post(
                    "/api/family/location",
                    json={"latitude": lat_p, "longitude": 77.5946, "battery_level": 90},
                    headers=blind["headers"],
                )

        # Verify calm arrival/departure events emitted ("Ramesh reached Home safely", "Ramesh left Home", "Ramesh reached Clinic safely")
        tl_all = (await self.client.get(f"/api/family/timeline/{invite_code}", headers=fam["headers"])).json()["timeline"]
        summaries = [e["summary"] for e in tl_all]
        self.assertTrue(any("reached Home safely" in s for s in summaries), summaries)
        self.assertTrue(any("left Home" in s for s in summaries), summaries)
        self.assertTrue(any("reached Clinic safely" in s for s in summaries), summaries)

        # 3. Deviation far off the usual route -> "taking a different route than usual"
        await self.client.post(
            "/api/family/location",
            json={"latitude": 12.9800, "longitude": 77.6200, "battery_level": 88},
            headers=blind["headers"],
        )
        tl_route = (await self.client.get(f"/api/family/timeline/{invite_code}", headers=fam["headers"])).json()["timeline"]
        self.assertTrue(any("different route than usual" in e["summary"] for e in tl_route), tl_route)

        # 4. Stopped 10 minutes in unfamiliar spot -> backdate anchor timestamp and ping nearby
        db = SessionLocal()
        try:
            sess_row = db.query(FamilyShareSession).filter(FamilyShareSession.blind_user_id == blind["id"]).first()
            sess_row.stopped_anchor_since = datetime.now(timezone.utc) - timedelta(minutes=12)
            sess_row.long_stop_alerted = False
            db.commit()
        finally:
            db.close()

        await self.client.post(
            "/api/family/location",
            json={"latitude": 12.98005, "longitude": 77.62005, "battery_level": 87},
            headers=blind["headers"],
        )
        tl_stop = (await self.client.get(f"/api/family/timeline/{invite_code}", headers=fam["headers"])).json()["timeline"]
        self.assertTrue(any("Stopped " in e["summary"] and "unfamiliar place" in e["summary"] for e in tl_stop), tl_stop)

        # 5. Alert grouping check: repeating deviation within 300s groups instead of spamming new row
        route_events_before = [e for e in tl_stop if e["event_type"] == "UNUSUAL_ROUTE"]
        await self.client.post(
            "/api/family/location",
            json={"latitude": 12.9805, "longitude": 77.6220, "battery_level": 86},
            headers=blind["headers"],
        )
        tl_grouped = (await self.client.get(f"/api/family/timeline/{invite_code}", headers=fam["headers"])).json()["timeline"]
        route_events_after = [e for e in tl_grouped if e["event_type"] == "UNUSUAL_ROUTE"]
        self.assertEqual(len(route_events_after), len(route_events_before))
        self.assertGreaterEqual(route_events_after[0]["grouped_count"], 2)

        # 6. Per-member consent: arrival_departure_only hides route/help events and disables live map
        r_perm = await self.client.put(
            f"/api/family/members/{link_id}/permissions",
            json={"arrival_departure_only": True},
            headers=blind["headers"],
        )
        self.assertEqual(r_perm.status_code, 200)
        self.assertTrue(r_perm.json()["arrival_departure_only"])

        r_fam_view = await self.client.get(f"/api/family/track/{invite_code}", headers=fam["headers"])
        fam_view = r_fam_view.json()
        self.assertFalse(fam_view["live_map_allowed"])
        self.assertEqual(fam_view["trail"], [])
        self.assertIsNone(fam_view["current_location"])
        self.assertFalse(any(e["category"] == "unusual_route" for e in fam_view["timeline"]))

        # 7. Quiet Hours suppression (non-urgent suppressed; SOS urgent bypasses quiet hours!)
        await self.client.post(
            "/api/family/sharing/consent",
            json={
                "consent_given": True,
                "is_sharing": True,
                "quiet_hours_enabled": True,
                "quiet_hours_start": "00:00",
                "quiet_hours_end": "23:59",
                "quiet_hours_tz_offset_min": 0,
            },
            headers=blind["headers"],
        )
        # Re-arrive Home -> non-urgent suppressed_by_quiet_hours=True
        await self.client.post(
            "/api/family/location",
            json={"latitude": 12.9716, "longitude": 77.5946, "battery_level": 85},
            headers=blind["headers"],
        )
        # Trigger urgent SOS -> MUST bypass quiet hours (suppressed_by_quiet_hours=False)
        await self.client.post(
            "/api/safety/sos",
            json={"latitude": 12.9716, "longitude": 77.5946, "notes": "Quiet hours SOS bypass"},
            headers=blind["headers"],
        )
        tl_quiet = (await self.client.get("/api/family/my/timeline", headers=blind["headers"])).json()
        arrival_ev = next((e for e in tl_quiet if e["event_type"] == "PLACE_ARRIVAL" and "Home" in e["summary"]), None)
        sos_ev = next((e for e in tl_quiet if e["event_type"] == "SOS_TRIGGERED"), None)
        self.assertIsNotNone(arrival_ev)
        self.assertTrue(arrival_ev["suppressed_by_quiet_hours"])
        self.assertIsNotNone(sos_ev)
        self.assertFalse(sos_ev["suppressed_by_quiet_hours"])
        await self.client.post("/api/safety/sos/resolve", headers=blind["headers"])

        # 8. Encryption at rest check in DB (no plaintext GPS floats on LocationBreadcrumb / FamilyShareSession)
        db = SessionLocal()
        try:
            crumbs = db.query(LocationBreadcrumb).filter(LocationBreadcrumb.user_id == blind["id"]).all()
            self.assertGreaterEqual(len(crumbs), 5)
            for c in crumbs:
                self.assertEqual(c.latitude, 0.0)
                self.assertEqual(c.longitude, 0.0)
                self.assertTrue((c.encrypted_coords or "").startswith("enc:v1:"))
            sess_row = db.query(FamilyShareSession).filter(FamilyShareSession.blind_user_id == blind["id"]).first()
            self.assertIsNone(sess_row.last_latitude)
            self.assertIsNone(sess_row.last_longitude)
            self.assertTrue((sess_row.encrypted_last_coords or "").startswith("enc:v1:"))

            # 9. Retention window pruning (crumbs older than 7 days removed while FamilyEvent kept)
            crumbs[0].recorded_at = datetime.now(timezone.utc) - timedelta(days=9)
            db.commit()
            pruned = prune_expired_location_history(db)
            self.assertGreaterEqual(pruned, 1)
            events_still_kept = db.query(FamilyEvent).filter(FamilyEvent.blind_user_id == blind["id"]).count()
            self.assertGreater(events_still_kept, 0)
        finally:
            db.close()

        # 10. Pause for 1 hour + One-tap "Delete my location history"
        r_pause1h = await self.client.post(
            "/api/family/sharing/consent",
            json={"consent_given": True, "is_sharing": True, "is_paused": True, "pause_minutes": 60},
            headers=blind["headers"],
        )
        self.assertEqual(r_pause1h.status_code, 200)
        self.assertTrue(r_pause1h.json()["is_paused"])
        self.assertIsNotNone(r_pause1h.json()["paused_minutes_remaining"])

        r_del = await self.client.delete("/api/family/location-history", headers=blind["headers"])
        self.assertEqual(r_del.status_code, 200)
        self.assertGreaterEqual(r_del.json()["breadcrumbs_deleted"], 1)

        db = SessionLocal()
        try:
            self.assertEqual(db.query(LocationBreadcrumb).filter(LocationBreadcrumb.user_id == blind["id"]).count(), 0)
            self.assertGreater(db.query(FamilyEvent).filter(FamilyEvent.blind_user_id == blind["id"]).count(), 0)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
