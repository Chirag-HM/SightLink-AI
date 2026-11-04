import unittest
from starlette.testclient import TestClient
from volunteer_assistance.backend.main import app
from volunteer_assistance.backend.database import Base, engine

class TestAssistanceFullFlow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    def test_end_to_end_assistance_flow(self):
        # 1. Register Blind User
        r_blind = self.client.post("/api/auth/register", json={
            "username": "ramesh_blind",
            "password": "securepassword123",
            "full_name": "Ramesh Kumar",
            "role": "blind_user"
        })
        self.assertIn(r_blind.status_code, [201, 400]) # 400 if already exists
        if r_blind.status_code == 400:
            r_blind = self.client.post("/api/auth/login", json={
                "username": "ramesh_blind",
                "password": "securepassword123"
            })
        blind_token = r_blind.json()["access_token"]
        blind_headers = {"Authorization": f"Bearer {blind_token}"}

        # 2. Register Volunteer
        r_vol = self.client.post("/api/auth/register", json={
            "username": "anita_volunteer",
            "password": "securepassword123",
            "full_name": "Anita Sharma",
            "role": "volunteer"
        })
        self.assertIn(r_vol.status_code, [201, 400])
        if r_vol.status_code == 400:
            r_vol = self.client.post("/api/auth/login", json={
                "username": "anita_volunteer",
                "password": "securepassword123"
            })
        vol_token = r_vol.json()["access_token"]
        vol_headers = {"Authorization": f"Bearer {vol_token}"}

        # 3. Volunteer enables availability and sets location near blind user (300 meters away)
        # Blind user at: 12.9716, 77.5946
        # Volunteer at: 12.9730, 77.5960 (~200m)
        r_avail = self.client.put("/api/volunteer/availability", json={"is_available": True}, headers=vol_headers)
        self.assertEqual(r_avail.status_code, 200)
        self.assertTrue(r_avail.json()["is_available"])

        r_loc = self.client.put("/api/volunteer/location", json={
            "latitude": 12.9730,
            "longitude": 77.5960,
            "share_consent": True
        }, headers=vol_headers)
        self.assertEqual(r_loc.status_code, 200)

        # 4. Blind User requests help
        r_req = self.client.post("/api/assistance/request", json={
            "latitude": 12.9716,
            "longitude": 77.5946,
            "assistance_type": "Road Crossing Assistance",
            "notes": "Waiting near bus shelter",
            "radius_km": 1.0
        }, headers=blind_headers)
        self.assertEqual(r_req.status_code, 200)
        req_data = r_req.json()
        req_id = req_data["request_id"]
        self.assertIsNotNone(req_id)
        self.assertGreaterEqual(req_data["volunteers_notified_count"], 1)

        # 5. Volunteer sees the pending request
        r_pending = self.client.get("/api/volunteer/pending-requests", headers=vol_headers)
        self.assertEqual(r_pending.status_code, 200)
        pending_list = r_pending.json()
        matching = [p for p in pending_list if p["id"] == req_id]
        self.assertEqual(len(matching), 1)
        self.assertIn("Road Crossing", matching[0]["assistance_type"])

        # 6. Volunteer accepts the request
        r_accept = self.client.post(f"/api/assistance/{req_id}/accept", headers=vol_headers)
        self.assertEqual(r_accept.status_code, 200)
        accept_data = r_accept.json()
        self.assertEqual(accept_data["status"], "ACCEPTED")

        # 7. Blind User checks active request
        r_active = self.client.get("/api/assistance/active", headers=blind_headers)
        self.assertEqual(r_active.status_code, 200)
        active_data = r_active.json()
        self.assertEqual(active_data["status"], "ACCEPTED")
        self.assertEqual(active_data["accepted_volunteer"]["full_name"], "Anita Sharma")

        # 8. Complete the assistance
        r_comp = self.client.post(f"/api/assistance/{req_id}/complete", headers=vol_headers)
        self.assertEqual(r_comp.status_code, 200)

if __name__ == '__main__':
    unittest.main()
