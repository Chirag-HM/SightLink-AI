import uuid
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[4]
ESP_CAM_DIR = ROOT_DIR / "ESP32_CAM_Test"
for p in (str(ROOT_DIR), str(ESP_CAM_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

import httpx
from volunteer_assistance.backend.main import app
from volunteer_assistance.backend.database import Base, SessionLocal, engine, run_migrations
from volunteer_assistance.backend.models import User, UserRole, ConnectedDevice, HealthRecord, HealthDailySummary
from volunteer_assistance.backend.auth import create_access_token, hash_password


class TestHealthConnectIntegration(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        run_migrations()

    def setUp(self):
        self.db = SessionLocal()
        self.suffix = uuid.uuid4().hex[:8]
        # Create test user
        self.user = User(
            username=f"health_user_{self.suffix}",
            email=f"health_{self.suffix}@sightlink.test",
            hashed_password=hash_password("Pass123!"),
            full_name=f"Health User {self.suffix}",
            role=UserRole.BLIND_USER,
            email_verified=True,
        )
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

        token = create_access_token({"sub": self.user.id, "role": self.user.role.value})
        self.headers = {"Authorization": f"Bearer {token}"}
        self.transport = httpx.ASGITransport(app=app)

    def tearDown(self):
        self.db.query(HealthRecord).filter(HealthRecord.user_id == self.user.id).delete()
        self.db.query(HealthDailySummary).filter(HealthDailySummary.user_id == self.user.id).delete()
        self.db.query(ConnectedDevice).filter(ConnectedDevice.user_id == self.user.id).delete()
        self.db.query(User).filter(User.id == self.user.id).delete()
        self.db.commit()
        self.db.close()

    async def test_pair_code_generation_and_device_registration(self):
        async with httpx.AsyncClient(transport=self.transport, base_url="http://testserver") as client:
            # 1. Generate pairing code from web dashboard
            r = await client.post("/api/health-connect/devices/pair-code", headers=self.headers)
            self.assertEqual(r.status_code, 200)
            data = r.json()
            pair_code = data["pairing_code"]
            self.assertTrue(pair_code.isdigit())
            self.assertEqual(len(pair_code), 6)

            # 2. Companion registers using pairing code
            reg_payload = {
                "pairing_code": pair_code,
                "device_name": "Google Pixel 8",
                "device_model": "Pixel 8 Pro",
                "os_version": "Android 14",
                "app_version": "1.0.0",
            }
            r_reg = await client.post("/api/health-connect/devices/register", json=reg_payload)
            self.assertEqual(r_reg.status_code, 200)
            reg_data = r_reg.json()
            self.assertIn("device_token", reg_data)
            self.assertEqual(reg_data["user_id"], self.user.id)
            device_token = reg_data["device_token"]

            # 3. Check connected devices list
            r_dev = await client.get("/api/health-connect/devices", headers=self.headers)
            self.assertEqual(r_dev.status_code, 200)
            dev_list = r_dev.json()
            self.assertEqual(len(dev_list), 1)
            self.assertEqual(dev_list[0]["device_name"], "Google Pixel 8")

            # 4. Update consents
            r_con = await client.post(
                "/api/health-connect/consents",
                headers={"X-Device-Token": device_token},
                json={
                    "consents": [
                        {"permission_name": "Steps", "granted": True},
                        {"permission_name": "HeartRate", "granted": True},
                    ]
                },
            )
            self.assertEqual(r_con.status_code, 200)

            # 5. Sync batch of health records
            now_utc = datetime.now(timezone.utc)
            records = [
                {
                    "client_record_id": f"rec_step_{self.suffix}",
                    "record_type": "steps",
                    "start_time": now_utc.isoformat(),
                    "end_time": (now_utc + timedelta(hours=1)).isoformat(),
                    "value_num": 3420.0,
                    "unit": "count",
                    "data_source": "com.google.android.apps.fitness",
                },
                {
                    "client_record_id": f"rec_hr_{self.suffix}",
                    "record_type": "heart_rate",
                    "start_time": now_utc.isoformat(),
                    "end_time": (now_utc + timedelta(minutes=5)).isoformat(),
                    "value_num": 72.0,
                    "unit": "bpm",
                    "data_source": "com.google.android.apps.fitness",
                },
                {
                    "client_record_id": f"rec_bp_{self.suffix}",
                    "record_type": "blood_pressure",
                    "start_time": now_utc.isoformat(),
                    "value_num": 120.0,  # systolic
                    "secondary_value_num": 80.0,  # diastolic
                    "unit": "mmHg",
                },
                {
                    "client_record_id": f"rec_sleep_{self.suffix}",
                    "record_type": "sleep_session",
                    "start_time": (now_utc - timedelta(hours=8)).isoformat(),
                    "end_time": (now_utc - timedelta(hours=1)).isoformat(),
                    "unit": "minutes",
                    "metadata_json": '{"stages": {"deep": 120, "rem": 90, "light": 180, "awake": 30}}',
                }
            ]

            r_sync = await client.post(
                "/api/health-connect/records/sync",
                headers={"X-Device-Token": device_token},
                json={"records": records},
            )
            self.assertEqual(r_sync.status_code, 200)
            sync_res = r_sync.json()
            self.assertEqual(sync_res["records_received"], 4)
            self.assertEqual(sync_res["records_inserted"], 4)

            # 6. Test deduplication - re-syncing the same records must not duplicate
            r_sync_dup = await client.post(
                "/api/health-connect/records/sync",
                headers={"X-Device-Token": device_token},
                json={"records": records},
            )
            self.assertEqual(r_sync_dup.status_code, 200)
            sync_dup_res = r_sync_dup.json()
            self.assertEqual(sync_dup_res["records_inserted"], 0)

            # 7. Check Dashboard Summary
            r_sum = await client.get("/api/health-connect/dashboard/summary", headers=self.headers)
            self.assertEqual(r_sum.status_code, 200)
            summary = r_sum.json()
            metrics = summary["metrics"]
            self.assertEqual(metrics["steps"], 3420)
            self.assertEqual(metrics["avg_heart_rate"], 72.0)
            self.assertEqual(metrics["systolic_avg"], 120.0)
            self.assertEqual(metrics["diastolic_avg"], 80.0)
            self.assertIsNotNone(metrics["sleep_duration_minutes"])
            self.assertIsNotNone(metrics["sleep_stages"])

            # 8. Check distinction between unavailable (null) and 0
            # Active calories was not recorded, so it must be None/null, not 0!
            self.assertIsNone(metrics["active_calories"])
            self.assertIsNone(metrics["spo2_avg"])

            # 9. Check Trends endpoint
            r_trends = await client.get("/api/health-connect/dashboard/trends?period=weekly", headers=self.headers)
            self.assertEqual(r_trends.status_code, 200)
            trends_data = r_trends.json()
            self.assertEqual(len(trends_data["data_points"]), 7)
            self.assertEqual(trends_data["summary_averages"]["avg_daily_steps"], 3420)

            # 10. Check Privacy Purge (Delete all records)
            r_del = await client.delete("/api/health-connect/records", headers=self.headers)
            self.assertEqual(r_del.status_code, 200)
            self.assertGreaterEqual(r_del.json()["deleted_records_count"], 4)

            # Post-purge summary should be empty
            r_sum_after = await client.get("/api/health-connect/dashboard/summary", headers=self.headers)
            self.assertIsNone(r_sum_after.json()["metrics"]["steps"])


if __name__ == "__main__":
    unittest.main()
