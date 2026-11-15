import unittest
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[4]
ESP_CAM_DIR = ROOT_DIR / "ESP32_CAM_Test"
for p in (str(ROOT_DIR), str(ESP_CAM_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

import httpx
from volunteer_assistance.backend.main import app


class TestBmtcTransit(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_route_stops_401a(self):
        resp = await self.client.get("/route-stops/401A?latitude=13.087&longitude=77.550")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("route_number"), "401A")
        self.assertGreater(data.get("total_stops"), 5)
        stops = data.get("stops", [])
        self.assertIn("seq", stops[0])
        self.assertIn("sequence_number", stops[0])
        self.assertIn("distance_from_start_km", stops[0])
        self.assertIsNotNone(data.get("nearest_user_stop"))
        self.assertIn("distance_m", data["nearest_user_stop"])

    async def test_route_stops_500d(self):
        resp = await self.client.get("/route-stops/500D")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertGreaterEqual(data.get("total_stops"), 20)

    async def test_trip_planner_sambhram_to_yeshwantpur(self):
        resp = await self.client.get("/trip-planner?source=Sambhram+College&destination=Yeshwantpur")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertGreater(data.get("routes_count"), 0)
        routes = data.get("routes", [])
        self.assertIn("401", routes[0]["route_number"])

    async def test_trip_planner_sambhram_to_majestic_transfer(self):
        resp = await self.client.get("/trip-planner?source=Sambhram+College+Gate&destination=Majestic")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertGreater(data.get("routes_count"), 0)

    async def test_trip_planner_hebbal_to_silkboard(self):
        resp = await self.client.get("/trip-planner?source=Hebbal&destination=Central+Silk+Board")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertGreater(data.get("routes_count"), 0)
        self.assertIn("500", data["routes"][0]["route_number"])

    async def test_popular_stops(self):
        resp = await self.client.get("/popular-stops")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertGreater(data.get("count"), 10)

    async def test_fare_estimate(self):
        resp = await self.client.get("/fare-estimate?distance_km=15")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertIn("ordinary_fare_inr", data)
        self.assertIn("vajra_ac_fare_inr", data)

