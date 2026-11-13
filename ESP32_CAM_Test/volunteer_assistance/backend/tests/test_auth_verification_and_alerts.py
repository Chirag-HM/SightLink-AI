import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import httpx

ROOT_DIR = Path(__file__).resolve().parents[4]
ESP_CAM_DIR = ROOT_DIR / "ESP32_CAM_Test"
for p in (str(ROOT_DIR), str(ESP_CAM_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from main import app as unified_app  # noqa: E402
from volunteer_assistance.backend.auth import set_google_verifier_override  # noqa: E402
from volunteer_assistance.backend.config import settings  # noqa: E402
from volunteer_assistance.backend.database import Base, SessionLocal, engine, run_migrations  # noqa: E402
from volunteer_assistance.backend.gmail_sender import gmail_sender  # noqa: E402
from volunteer_assistance.backend.models import (  # noqa: E402
    EmailVerificationCode,
    FamilyLink,
    FamilyShareSession,
    NotificationDeliveryLog,
    PendingRegistration,
    RateLimitEntry,
    TelegramLink,
    User,
    UserRole,
)
from volunteer_assistance.backend.notification_service import notification_service  # noqa: E402
from volunteer_assistance.backend.telegram_bot import process_telegram_update, telegram_bot  # noqa: E402


class TestAuthVerificationAndAlerts(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        run_migrations()

    async def asyncSetUp(self):
        self.transport = httpx.ASGITransport(app=unified_app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://testserver")
        self.suffix = uuid.uuid4().hex[:8]
        self.test_ip = f"10.0.{int(self.suffix[:2], 16) % 250}.{int(self.suffix[2:4], 16) % 250}"
        self.sent_emails: list[dict] = []
        self.sent_telegrams: list[dict] = []

        # Speed up retry delays for test suite
        notification_service.set_retry_delays((0.01, 0.01))

        def _capture_email(to_email: str, subject: str, html_body: str, text_body: str):
            self.sent_emails.append({
                "to": to_email,
                "subject": subject,
                "html": html_body,
                "text": text_body,
            })

        def _capture_tg(chat_id: str, text: str, button_url: str | None = None):
            self.sent_telegrams.append({
                "chat_id": chat_id,
                "text": text,
                "button_url": button_url,
            })
            return True

        gmail_sender.set_transport_override(_capture_email)
        telegram_bot.set_sender_override(_capture_tg)

    async def asyncTearDown(self):
        set_google_verifier_override(None)
        gmail_sender.set_transport_override(None)
        telegram_bot.set_sender_override(None)
        notification_service.set_retry_delays((0.35, 0.9))
        await self.client.aclose()

    def _ip_headers(self, extra: dict | None = None) -> dict:
        h = {"X-Forwarded-For": self.test_ip}
        if extra:
            h.update(extra)
        return h

    def _extract_latest_otp(self, recipient_email: str) -> str:
        import re

        for mail in reversed(self.sent_emails):
            if mail["to"].lower() == recipient_email.lower():
                m = re.search(r"(\d{6})\s+is your SightLink", mail["subject"])
                if m:
                    return m.group(1)
                m2 = re.search(r"verification code is:\s*(\d{6})", mail["text"])
                if m2:
                    return m2.group(1)
        raise AssertionError(f"No OTP email found for {recipient_email}")

    async def test_google_signin_role_selection_and_cookie_csrf_security(self):
        google_email = f"guser_{self.suffix}@gmail.com"
        google_sub = f"sub_{self.suffix}"
        photo = "https://lh3.googleusercontent.com/a/demo-avatar"

        # 1. Unverified Google account MUST be rejected
        set_google_verifier_override(
            lambda tok: {
                "sub": google_sub,
                "email": google_email,
                "name": "Unverified Google",
                "picture": photo,
                "email_verified": False,
            }
        )
        r_unv = await self.client.post(
            "/api/auth/google",
            json={"credential": "mock-google-token-unverified"},
            headers=self._ip_headers(),
        )
        self.assertEqual(r_unv.status_code, 403, r_unv.text)

        # 2. Verified Google account -> succeeds without OTP, sets httpOnly session + CSRF cookie
        set_google_verifier_override(
            lambda tok: {
                "sub": google_sub,
                "email": google_email,
                "name": "Asha Google",
                "picture": photo,
                "email_verified": True,
            }
        )
        r_ok = await self.client.post(
            "/api/auth/google",
            json={"credential": "mock-google-token-valid"},
            headers=self._ip_headers(),
        )
        self.assertEqual(r_ok.status_code, 200, r_ok.text)
        data = r_ok.json()
        self.assertTrue(data["email_verified"])
        self.assertTrue(data["emailVerified"])
        self.assertTrue(data["needs_role_selection"])
        self.assertEqual(data["email"], google_email)
        self.assertEqual(data["full_name"], "Asha Google")
        self.assertEqual(data["photo_url"], photo)

        set_cookie_headers = r_ok.headers.get_list("set-cookie")
        session_cookie_hdr = [c for c in set_cookie_headers if c.startswith("sightlink_session=")]
        self.assertTrue(session_cookie_hdr, "Expected httpOnly sightlink_session cookie")
        self.assertIn("httponly", session_cookie_hdr[0].lower())
        self.assertIn("sightlink_session", self.client.cookies)
        self.assertIn("sightlink_csrf", self.client.cookies)

        # 3. Verify GET /api/auth/me works cleanly via cookie (no Bearer header)
        r_me = await self.client.get("/api/auth/me")
        self.assertEqual(r_me.status_code, 200, r_me.text)
        self.assertEqual(r_me.json()["photo_url"], photo)

        # 4. Cookie POST WITHOUT X-CSRF-Token header MUST fail with 403
        r_no_csrf = await self.client.post(
            "/api/auth/select-role",
            json={"role": "family"},
        )
        self.assertEqual(r_no_csrf.status_code, 403, r_no_csrf.text)

        # 5. Cookie POST WITH matching X-CSRF-Token succeeds and saves role
        csrf_tok = self.client.cookies.get("sightlink_csrf")
        r_with_csrf = await self.client.post(
            "/api/auth/select-role",
            json={"role": "family"},
            headers={"X-CSRF-Token": csrf_tok},
        )
        self.assertEqual(r_with_csrf.status_code, 200, r_with_csrf.text)
        sel = r_with_csrf.json()
        self.assertEqual(sel["role"], "family")
        self.assertFalse(sel["needs_role_selection"])

        # 6. Logout clears cookies
        csrf_tok2 = self.client.cookies.get("sightlink_csrf")
        r_logout = await self.client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf_tok2})
        self.assertEqual(r_logout.status_code, 200)
        r_after = await self.client.get("/api/auth/me")
        self.assertEqual(r_after.status_code, 401)

    async def test_email_otp_hashing_lockout_cooldown_expiry_and_gating(self):
        email = f"blind_{self.suffix}@example.com"
        uname = f"b_otp_{self.suffix}"

        # Register email/password user (no localStorage Bearer needed for gates test; we use Bearer cleanly in isolated headers)
        r_reg = await self.client.post(
            "/api/auth/register",
            json={
                "username": uname,
                "email": email,
                "password": "password123",
                "full_name": "Kiran OTP",
                "role": "blind_user",
            },
            headers=self._ip_headers(),
        )
        self.assertEqual(r_reg.status_code, 201, r_reg.text)
        reg = r_reg.json()
        self.assertFalse(reg["email_verified"])
        self.assertTrue(reg["verification_required"])
        blind_headers = self._ip_headers({"Authorization": f"Bearer {reg['access_token']}"})

        first_otp = self._extract_latest_otp(email)

        # Check DB only stores HMAC digest, NEVER plaintext code
        db = SessionLocal()
        try:
            otp_row = (
                db.query(EmailVerificationCode)
                .filter(EmailVerificationCode.email == email)
                .order_by(EmailVerificationCode.created_at.desc())
                .first()
            )
            self.assertIsNotNone(otp_row)
            self.assertNotIn(first_otp, otp_row.code_hash)
            self.assertEqual(len(otp_row.code_hash), 64)
        finally:
            db.close()

        # Unverified blind user is BLOCKED from SOS, Help Request, and Live Assist (403)
        r_sos_block = await self.client.post(
            "/api/safety/sos",
            json={"latitude": 12.9716, "longitude": 77.5946},
            headers=blind_headers,
        )
        self.assertEqual(r_sos_block.status_code, 403, r_sos_block.text)
        self.assertIn("verify your email", r_sos_block.json()["detail"].lower())

        r_help_block = await self.client.post(
            "/api/assistance/request",
            json={"latitude": 12.9716, "longitude": 77.5946, "assistance_type": "crossing road"},
            headers=blind_headers,
        )
        self.assertEqual(r_help_block.status_code, 403)

        r_live_block = await self.client.post(
            "/api/live-assist/sessions",
            json={"latitude": 12.9716, "longitude": 77.5946, "consent_confirmed": True},
            headers=blind_headers,
        )
        self.assertEqual(r_live_block.status_code, 403)

        # Unverified-email volunteer also blocked from going on duty & accepting
        vol_email = f"vol_{self.suffix}@example.com"
        r_vreg = await self.client.post(
            "/api/auth/register",
            json={
                "username": f"v_otp_{self.suffix}",
                "email": vol_email,
                "password": "password123",
                "full_name": "Rahul UnverifiedEmail",
                "role": "volunteer",
                "verification_method": "id",
                "id_number": "GOV-999111",
            },
            headers=self._ip_headers(),
        )
        self.assertEqual(r_vreg.status_code, 201)
        vol_headers = self._ip_headers({"Authorization": f"Bearer {r_vreg.json()['access_token']}"})
        r_vol_duty = await self.client.put(
            "/api/volunteer/availability",
            json={"is_available": True},
            headers=vol_headers,
        )
        self.assertEqual(r_vol_duty.status_code, 403)

        # Resend within 60s MUST trigger cooldown (429)
        r_cd = await self.client.post(
            "/api/auth/email/send-code",
            json={"email": email},
            headers=blind_headers,
        )
        self.assertEqual(r_cd.status_code, 429, r_cd.text)

        # Wrong OTP attempts: 4 bad tries then 5th locks (423)
        wrong_code = "000000" if first_otp != "000000" else "999999"
        for i in range(4):
            r_bad = await self.client.post(
                "/api/auth/email/verify",
                json={"email": email, "code": wrong_code},
                headers=blind_headers,
            )
            self.assertEqual(r_bad.status_code, 400, f"Try {i+1}: {r_bad.text}")

        r_lock = await self.client.post(
            "/api/auth/email/verify",
            json={"email": email, "code": wrong_code},
            headers=blind_headers,
        )
        self.assertEqual(r_lock.status_code, 423, r_lock.text)

        # Even valid code on locked record fails with 423
        r_still_locked = await self.client.post(
            "/api/auth/email/verify",
            json={"email": email, "code": first_otp},
            headers=blind_headers,
        )
        self.assertEqual(r_still_locked.status_code, 423)

        # Backdate cooldown rate-limit event to simulate 60s elapsed -> resend new code
        db = SessionLocal()
        try:
            cd_rows = (
                db.query(RateLimitEntry)
                .filter(RateLimitEntry.bucket_key == f"otp_send_cd:{email}")
                .all()
            )
            for row in cd_rows:
                row.created_at = datetime.now(timezone.utc) - timedelta(seconds=120)
            # Clear verify burst window so test doesn't trip 10-min wrong-try limit
            db.query(RateLimitEntry).filter(
                RateLimitEntry.bucket_key == f"otp_verify_email:{email}"
            ).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()

        r_resend = await self.client.post(
            "/api/auth/email/send-code",
            json={"email": email},
            headers=blind_headers,
        )
        self.assertEqual(r_resend.status_code, 200, r_resend.text)
        second_otp = self._extract_latest_otp(email)

        # Old code must have been invalidated (cannot use first_otp anymore even if unlocked)
        if first_otp != second_otp:
            r_old = await self.client.post(
                "/api/auth/email/verify",
                json={"email": email, "code": first_otp},
                headers=blind_headers,
            )
            self.assertEqual(r_old.status_code, 400)

        # Expired code rejected
        db = SessionLocal()
        try:
            latest = (
                db.query(EmailVerificationCode)
                .filter(EmailVerificationCode.email == email, EmailVerificationCode.invalidated == False)
                .order_by(EmailVerificationCode.created_at.desc())
                .first()
            )
            latest.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
            db.commit()
        finally:
            db.close()

        r_exp = await self.client.post(
            "/api/auth/email/verify",
            json={"email": email, "code": second_otp},
            headers=blind_headers,
        )
        self.assertEqual(r_exp.status_code, 400)
        self.assertIn("expired", r_exp.json()["detail"].lower())

        # Restore non-expired deadline & verify -> unlocks user!
        db = SessionLocal()
        try:
            latest = (
                db.query(EmailVerificationCode)
                .filter(EmailVerificationCode.email == email, EmailVerificationCode.invalidated == False)
                .order_by(EmailVerificationCode.created_at.desc())
                .first()
            )
            latest.expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
            db.commit()
        finally:
            db.close()

        r_ok = await self.client.post(
            "/api/auth/email/verify",
            json={"email": email, "code": second_otp},
            headers=blind_headers,
        )
        self.assertEqual(r_ok.status_code, 200, r_ok.text)
        self.assertTrue(r_ok.json()["email_verified"])

        # Login with EMAIL address works too
        r_email_login = await self.client.post(
            "/api/auth/login",
            json={"username": email, "password": "password123"},
        )
        self.assertEqual(r_email_login.status_code, 200, r_email_login.text)
        self.assertTrue(r_email_login.json()["email_verified"])

        # Now SOS & Help Request unlock cleanly (200)
        r_sos_ok = await self.client.post(
            "/api/safety/sos",
            json={"latitude": 12.9716, "longitude": 77.5946, "battery_level": 76},
            headers=blind_headers,
        )
        self.assertEqual(r_sos_ok.status_code, 200, r_sos_ok.text)
        self.assertIn("google_maps_url", r_sos_ok.json())
        self.assertTrue(r_sos_ok.json()["sms_fallback_url"].startswith("sms:?body="))
        self.assertTrue(r_sos_ok.json()["whatsapp_fallback_url"].startswith("https://wa.me/?text="))

        # Test volunteer without email OTP verified -> verify identity unlocks availability
        vol_otp = self._extract_latest_otp(vol_email)
        r_vol_ver = await self.client.post("/api/auth/email/verify", json={"email": vol_email, "code": vol_otp}, headers=vol_headers)
        self.assertEqual(r_vol_ver.status_code, 200, r_vol_ver.text)
        r_vol_avail = await self.client.put("/api/volunteer/availability", json={"is_available": True}, headers=vol_headers)
        self.assertEqual(r_vol_avail.status_code, 200, r_vol_avail.text)

    async def _setup_verified_blind_and_family(self):
        # 1. Register & verify blind user
        b_email = f"b_fam_{self.suffix}_{uuid.uuid4().hex[:4]}@example.com"
        r_b = await self.client.post(
            "/api/auth/register",
            json={
                "username": f"bfam_{uuid.uuid4().hex[:6]}",
                "email": b_email,
                "password": "password123",
                "full_name": "Arun Sharma",
                "role": "blind_user",
            },
            headers=self._ip_headers(),
        )
        self.assertEqual(r_b.status_code, 201)
        b_headers = self._ip_headers({"Authorization": f"Bearer {r_b.json()['access_token']}"})
        b_otp = self._extract_latest_otp(b_email)
        self.assertEqual(
            (await self.client.post("/api/auth/email/verify", json={"email": b_email, "code": b_otp}, headers=b_headers)).status_code,
            200,
        )

        # Grab invite code + save a place ("Clinic") + keep sharing consent enabled
        share = (
            await self.client.post(
                "/api/family/sharing/consent",
                json={"consent_given": True, "is_sharing": True},
                headers=b_headers,
            )
        ).json()
        invite_code = share["invite_code"]

        # 2. Register & verify family member + connect Telegram via webhook /start <token>
        f_email = f"mom_{self.suffix}_{uuid.uuid4().hex[:4]}@example.com"
        r_f = await self.client.post(
            "/api/auth/register",
            json={
                "username": f"fam_{uuid.uuid4().hex[:6]}",
                "email": f_email,
                "password": "password123",
                "full_name": "Meera Sharma",
                "role": "family",
            },
            headers=self._ip_headers(),
        )
        self.assertEqual(r_f.status_code, 201)
        f_id = r_f.json()["user_id"]
        f_headers = self._ip_headers({"Authorization": f"Bearer {r_f.json()['access_token']}"})
        f_otp = self._extract_latest_otp(f_email)
        self.assertEqual(
            (await self.client.post("/api/auth/email/verify", json={"email": f_email, "code": f_otp}, headers=f_headers)).status_code,
            200,
        )

        # Link family to blind user & confirm
        r_lnk = await self.client.post(
            "/api/family/link",
            json={"invite_code": invite_code, "relationship_label": "Mother"},
            headers=f_headers,
        )
        self.assertEqual(r_lnk.status_code, 200)
        link_id = r_lnk.json()["link_id"]
        self.assertEqual(
            (await self.client.post(f"/api/family/members/{link_id}/confirm", json={"approved": True}, headers=b_headers)).status_code,
            200,
        )

        # Connect Telegram via generated deep link + /start <token>
        r_tg = await self.client.post("/api/telegram/connect-link", headers=f_headers)
        self.assertEqual(r_tg.status_code, 200)
        tg_info = r_tg.json()
        self.assertIn("https://t.me/", tg_info["connect_url"])
        tg_tok = tg_info["token"]

        db = SessionLocal()
        try:
            res_start = await process_telegram_update(
                db,
                {
                    "update_id": 1001,
                    "message": {
                        "chat": {"id": 99887766, "username": "meera_tg"},
                        "from": {"username": "meera_tg"},
                        "text": f"/start {tg_tok}",
                    },
                },
            )
            self.assertTrue(res_start["handled"])
            self.assertEqual(res_start["action"], "connected")
        finally:
            db.close()

        self.assertTrue(any("Connected. You'll get alerts here." in m["text"] for m in self.sent_telegrams))
        r_tg_stat = await self.client.get("/api/telegram/status", headers=f_headers)
        self.assertEqual(r_tg_stat.status_code, 200)
        self.assertTrue(r_tg_stat.json()["connected"])

        return {
            "blind_id": r_b.json()["user_id"],
            "blind_headers": b_headers,
            "blind_email": b_email,
            "family_id": f_id,
            "family_headers": f_headers,
            "family_email": f_email,
            "invite_code": invite_code,
            "link_id": link_id,
        }

    async def test_telegram_stop_disconnect_and_multichannel_alerts_resilience(self):
        ctx = await self._setup_verified_blind_and_family()
        b_headers = ctx["blind_headers"]
        f_headers = ctx["family_headers"]
        f_email = ctx["family_email"]

        # Clear OTP emails before alert assertions
        self.sent_emails.clear()
        self.sent_telegrams.clear()

        # Enable Quiet Hours (all day 00:00 -> 23:59 UTC) to prove:
        # 1) Urgent SOS & NO_VOLUNTEER_AVAILABLE BYPASS quiet hours
        # 2) Low-priority events are suppressed by quiet hours
        self.assertEqual(
            (
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
                    headers=b_headers,
                )
            ).status_code,
            200,
        )

        # A. Trigger Urgent SOS with battery level & GPS -> BOTH Email + Telegram MUST fire despite Quiet Hours!
        r_sos = await self.client.post(
            "/api/safety/sos",
            json={"latitude": 12.971612, "longitude": 77.594612, "battery_level": 41},
            headers=b_headers,
        )
        self.assertEqual(r_sos.status_code, 200, r_sos.text)
        sos_body = r_sos.json()
        self.assertEqual(sos_body["battery_level"], 41)
        self.assertIn("12.971612,77.594612", sos_body["google_maps_url"])

        sos_emails = [m for m in self.sent_emails if m["to"] == f_email]
        sos_tgs = [m for m in self.sent_telegrams if m["chat_id"] == "99887766"]
        self.assertEqual(len(sos_emails), 1, f"Expected SOS email, got {self.sent_emails}")
        self.assertIn("View live location", sos_emails[0]["html"])
        self.assertIn("41%", sos_emails[0]["html"])
        self.assertIn("maps.google.com/?q=12.971612,77.594612", sos_emails[0]["text"])
        self.assertEqual(len(sos_tgs), 1, f"Expected SOS Telegram, got {self.sent_telegrams}")
        self.assertIn("41%", sos_tgs[0]["text"])
        self.assertEqual(sos_tgs[0]["button_url"], "https://maps.google.com/?q=12.971612,77.594612")

        # B. Widening search -> Stage 3 No volunteer available -> sends urgent alert ("No volunteer available nearby. Arun may need help.")
        self.sent_emails.clear()
        self.sent_telegrams.clear()
        r_req = await self.client.post(
            "/api/assistance/request",
            json={"latitude": 12.9716, "longitude": 77.5946, "assistance_type": "crossing road"},
            headers=b_headers,
        )
        self.assertEqual(r_req.status_code, 200)
        req_id = r_req.json()["request_id"]
        for _ in range(3):
            await self.client.post(f"/api/assistance/{req_id}/escalate", headers=b_headers)

        no_vol_emails = [m for m in self.sent_emails if m["to"] == f_email]
        no_vol_tgs = [m for m in self.sent_telegrams if m["chat_id"] == "99887766"]
        self.assertTrue(
            any("No volunteer available nearby. Arun may need help." in m["html"] for m in no_vol_emails),
            no_vol_emails,
        )
        self.assertTrue(
            any("No volunteer available nearby. Arun may need help." in m["text"] for m in no_vol_tgs),
            no_vol_tgs,
        )

        # C. Low-priority event during Quiet Hours MUST NOT dispatch external push/email/telegram
        self.sent_emails.clear()
        self.sent_telegrams.clear()
        v_email = f"vh_{self.suffix}@example.com"
        r_v = await self.client.post(
            "/api/auth/register",
            json={
                "username": f"vh_{self.suffix}",
                "email": v_email,
                "password": "password123",
                "full_name": "Sita Helper",
                "role": "volunteer",
                "verification_method": "id",
                "id_number": "NGO-554433",
            },
            headers=self._ip_headers(),
        )
        v_headers = self._ip_headers({"Authorization": f"Bearer {r_v.json()['access_token']}"})
        v_otp = self._extract_latest_otp(v_email)
        await self.client.post("/api/auth/email/verify", json={"email": v_email, "code": v_otp}, headers=v_headers)
        await self.client.put("/api/volunteer/availability", json={"is_available": True}, headers=v_headers)
        await self.client.put(
            "/api/volunteer/location",
            json={"latitude": 12.9719, "longitude": 77.5948, "share_consent": True},
            headers=v_headers,
        )

        # Accept while Quiet Hours ON -> suppressed externally
        self.sent_emails.clear()
        self.sent_telegrams.clear()
        r_acc = await self.client.post(f"/api/assistance/{req_id}/accept", headers=v_headers)
        self.assertEqual(r_acc.status_code, 200)
        self.assertEqual(len([m for m in self.sent_emails if m["to"] == f_email]), 0)
        self.assertEqual(len(self.sent_telegrams), 0)

        # Turn Quiet Hours OFF -> Complete request -> triggers "Help session finished safely" via Email + Telegram!
        await self.client.post(
            "/api/family/sharing/consent",
            json={"consent_given": True, "is_sharing": True, "quiet_hours_enabled": False},
            headers=b_headers,
        )
        self.assertEqual(
            (await self.client.post(f"/api/assistance/{req_id}/complete", headers=b_headers)).status_code,
            200,
        )
        self.assertTrue(
            any("Help session finished safely" in m["html"] for m in self.sent_emails if m["to"] == f_email),
            self.sent_emails,
        )
        self.assertTrue(
            any("Help session finished safely" in m["text"] for m in self.sent_telegrams),
            self.sent_telegrams,
        )

        # D. Saved Place arrival triggers Email + Telegram; Per-member toggle disables Email when toggled off!
        await self.client.post(
            "/api/family/saved-places",
            json={"name": "Clinic", "category": "clinic", "latitude": 12.9750, "longitude": 77.5950, "radius_m": 250},
            headers=b_headers,
        )
        # Toggle Email OFF for this member link, keep Telegram ON
        r_pref = await self.client.put(
            f"/api/family/my-links/{ctx['link_id']}/preferences",
            json={"notify_email": False, "notify_telegram": True},
            headers=f_headers,
        )
        self.assertEqual(r_pref.status_code, 200)
        self.assertFalse(r_pref.json()["notify_email"])

        self.sent_emails.clear()
        self.sent_telegrams.clear()
        await self.client.post(
            "/api/family/location",
            json={"latitude": 12.9751, "longitude": 77.5951, "battery_level": 80},
            headers=b_headers,
        )
        self.assertEqual(len([m for m in self.sent_emails if m["to"] == f_email]), 0)
        self.assertTrue(any("reached Clinic safely" in m["text"] for m in self.sent_telegrams))

        # Re-enable Email, break SMTP transport to verify Channel Fault Isolation + Retries + NotificationDeliveryLog
        await self.client.put(
            f"/api/family/my-links/{ctx['link_id']}/preferences",
            json={"notify_email": True, "notify_telegram": True},
            headers=f_headers,
        )
        smtp_attempts = {"count": 0}

        def _failing_smtp(*args, **kwargs):
            smtp_attempts["count"] += 1
            raise RuntimeError("Simulated Gmail 550 transient outage")

        gmail_sender.set_transport_override(_failing_smtp)
        self.sent_telegrams.clear()

        # Clear SOS dedup/rate limit via unique SOS + verify Telegram STILL delivers when Email fails!
        r_sos2 = await self.client.post(
            "/api/safety/sos",
            json={"latitude": 12.9760, "longitude": 77.5960, "battery_level": 35},
            headers=b_headers,
        )
        self.assertEqual(r_sos2.status_code, 200)
        # NotificationService retry_delays = (0.01, 0.01) => 3 attempts total
        self.assertEqual(smtp_attempts["count"], 3)
        # Telegram still succeeded cleanly!
        self.assertTrue(any("EMERGENCY SOS" in m["text"] for m in self.sent_telegrams))

        r_logs = await self.client.get("/api/family/notifications/logs", headers=f_headers)
        self.assertEqual(r_logs.status_code, 200)
        logs = r_logs.json()
        self.assertTrue(any(l["channel"] == "email" and l["status"] == "failed" and l["attempt_count"] == 3 for l in logs), logs)
        self.assertTrue(any(l["channel"] == "telegram" and l["status"] == "sent" for l in logs), logs)

        # E. Deduplication within repeat window skips duplicate external dispatch
        self.sent_telegrams.clear()
        dup1 = await notification_service.dispatch_family_alert(
            SessionLocal(),
            ctx["blind_id"],
            event_type="PLACE_ARRIVAL",
            category="arrival_departure",
            title="Arrived Home",
            summary="Arun reached Home safely",
            urgent=False,
            dedup_entity=f"dedup-{self.suffix}",
        )
        self.assertEqual(len(self.sent_telegrams), 1)
        dup2 = await notification_service.dispatch_family_alert(
            SessionLocal(),
            ctx["blind_id"],
            event_type="PLACE_ARRIVAL",
            category="arrival_departure",
            title="Arrived Home",
            summary="Arun reached Home safely",
            urgent=False,
            dedup_entity=f"dedup-{self.suffix}",
        )
        # Same dedup_entity within window MUST be skipped (no 2nd Telegram sent)
        self.assertEqual(len(self.sent_telegrams), 1)
        self.assertTrue(any(r["channel"] == "telegram" and r["status"] == "skipped" for r in dup2))

        # F. Telegram /stop honors opt-out + /disconnect unlinks chat_id
        db = SessionLocal()
        try:
            stop_res = await process_telegram_update(
                db,
                {
                    "update_id": 1002,
                    "message": {
                        "chat": {"id": 99887766, "username": "meera_tg"},
                        "text": "/stop",
                    },
                },
            )
            self.assertEqual(stop_res["action"], "stopped")
        finally:
            db.close()

        r_stat_after_stop = await self.client.get("/api/telegram/status", headers=f_headers)
        self.assertFalse(r_stat_after_stop.json()["connected"])

        r_disc = await self.client.post("/api/telegram/disconnect", headers=f_headers)
        self.assertEqual(r_disc.status_code, 200)
        self.assertFalse(r_disc.json()["connected"])

        # G. SOS rate limiting kicks in after SOS_RATE_LIMIT_MAX hits
        # We already triggered 2 SOS calls above; trigger remaining until 429
        got_429 = False
        for _ in range(settings.SOS_RATE_LIMIT_MAX + 2):
            r_lim = await self.client.post(
                "/api/safety/sos",
                json={"latitude": 12.9716, "longitude": 77.5946},
                headers=b_headers,
            )
            if r_lim.status_code == 429:
                got_429 = True
                break
        self.assertTrue(got_429, "Expected SOS endpoint to enforce 429 rate limiting")

    async def test_pending_registration_does_not_claim_username_or_email_until_verified(self):
        email_a = f"pend_a_{self.suffix}@example.com"
        email_b = f"pend_b_{self.suffix}@example.com"
        shared_uname = f"shared_{self.suffix}"

        # 1. Start signup for email_a + shared_uname -> must stay in pending_registrations, NOT users
        r1 = await self.client.post(
            "/api/auth/register",
            json={
                "username": shared_uname,
                "email": email_a,
                "password": "password123",
                "full_name": "First Draft",
                "role": "blind_user",
            },
            headers=self._ip_headers(),
        )
        self.assertEqual(r1.status_code, 201, r1.text)
        self.assertFalse(r1.json()["email_verified"])

        db = SessionLocal()
        try:
            self.assertIsNone(db.query(User).filter(User.email == email_a).first())
            self.assertIsNone(db.query(User).filter(User.username == shared_uname).first())
            self.assertIsNotNone(db.query(PendingRegistration).filter(PendingRegistration.email == email_a).first())
        finally:
            db.close()

        # Login before email verification MUST NOT succeed
        r_login_unv = await self.client.post(
            "/api/auth/login",
            json={"username": email_a, "password": "password123"},
        )
        self.assertEqual(r_login_unv.status_code, 403)

        # 2. Re-submit signup with SAME unverified email_a and an updated username -> MUST succeed (no false 400!)
        updated_uname = f"updated_{self.suffix}"
        r2 = await self.client.post(
            "/api/auth/register",
            json={
                "username": updated_uname,
                "email": email_a,
                "password": "password456",
                "full_name": "Updated Draft",
                "role": "blind_user",
            },
            headers=self._ip_headers(),
        )
        self.assertEqual(r2.status_code, 201, r2.text)
        r2_headers = self._ip_headers({"Authorization": f"Bearer {r2.json()['access_token']}"})

        # 3. Another user (email_b) tries using shared_uname or updated_uname BEFORE email_a verifies -> MUST succeed!
        r3 = await self.client.post(
            "/api/auth/register",
            json={
                "username": updated_uname,
                "email": email_b,
                "password": "password789",
                "full_name": "Contestant B",
                "role": "blind_user",
            },
            headers=self._ip_headers(),
        )
        self.assertEqual(r3.status_code, 201, r3.text)
        r3_headers = self._ip_headers({"Authorization": f"Bearer {r3.json()['access_token']}"})

        # Unauthenticated resend for nonexistent pending email returns no_pending with cooldown=0
        self.client.cookies.clear()
        r_no_pend = await self.client.post(
            "/api/auth/email/send-code",
            json={"email": f"missing_{self.suffix}@example.com"},
            headers=self._ip_headers(),
        )
        self.assertEqual(r_no_pend.status_code, 200, r_no_pend.text)
        self.assertEqual(r_no_pend.json()["status"], "no_pending")
        self.assertEqual(r_no_pend.json()["cooldown_seconds"], 0)

        # 4. Verify email_a -> NOW updated_uname & email_a become permanently registered in users
        otp_a = self._extract_latest_otp(email_a)
        r_va = await self.client.post(
            "/api/auth/email/verify",
            json={"email": email_a, "code": otp_a},
            headers=r2_headers,
        )
        self.assertEqual(r_va.status_code, 200, r_va.text)
        self.assertTrue(r_va.json()["email_verified"])

        db = SessionLocal()
        try:
            u = db.query(User).filter(User.email == email_a).first()
            self.assertIsNotNone(u)
            self.assertEqual(u.username, updated_uname)
            self.assertTrue(u.email_verified)
            self.assertIsNone(db.query(PendingRegistration).filter(PendingRegistration.email == email_a).first())
        finally:
            db.close()

        # 5. Once verified, registering with email_a or updated_uname rejects cleanly with 400,
        # and verifying competing email_b with already-claimed updated_uname rejects with 409!
        r_dup = await self.client.post(
            "/api/auth/register",
            json={
                "username": updated_uname,
                "email": f"fresh_{self.suffix}@example.com",
                "password": "password123",
                "full_name": "Latecomer",
                "role": "blind_user",
            },
            headers=self._ip_headers(),
        )
        self.assertEqual(r_dup.status_code, 400)

        otp_b = self._extract_latest_otp(email_b)
        r_vb = await self.client.post(
            "/api/auth/email/verify",
            json={"email": email_b, "code": otp_b},
            headers=r3_headers,
        )
        self.assertEqual(r_vb.status_code, 409, r_vb.text)

    async def test_telegram_manual_token_and_web_fallback(self):
        email = f"tgman_{self.suffix}@example.com"
        r_reg = await self.client.post(
            "/api/auth/register",
            json={
                "username": f"tgman_{self.suffix}",
                "email": email,
                "password": "password123",
                "full_name": "Telegram Manual Fallback",
                "role": "blind_user",
            },
            headers=self._ip_headers(),
        )
        self.assertEqual(r_reg.status_code, 201)
        headers = self._ip_headers({"Authorization": f"Bearer {r_reg.json()['access_token']}"})
        otp = self._extract_latest_otp(email)
        self.assertEqual(
            (await self.client.post("/api/auth/email/verify", json={"email": email, "code": otp}, headers=headers)).status_code,
            200,
        )

        r_link = await self.client.post("/api/telegram/connect-link", headers=headers)
        self.assertEqual(r_link.status_code, 200)
        info = r_link.json()
        self.assertIn("web.telegram.org", info["web_url"])
        self.assertEqual(info["start_command"], f"/start {info['token']}")

        # Pasting bare token directly in Telegram chat (when t.me deep link didn't launch desktop app) links cleanly
        db = SessionLocal()
        try:
            res = await process_telegram_update(
                db,
                {
                    "update_id": 2001,
                    "message": {
                        "chat": {"id": 55667788, "username": "manual_user"},
                        "from": {"username": "manual_user"},
                        "text": info["token"],
                    },
                },
            )
            self.assertEqual(res["action"], "connected")
        finally:
            db.close()

        r_stat = await self.client.get("/api/telegram/status", headers=headers)
        self.assertEqual(r_stat.status_code, 200)
        self.assertTrue(r_stat.json()["connected"])


if __name__ == "__main__":
    unittest.main()
