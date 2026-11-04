import unittest
from volunteer_assistance.backend.geospatial import (
    haversine_distance_km, is_within_radius, calculate_approx_distance_text, fuzz_coordinates_for_privacy
)

class TestGeospatialMath(unittest.TestCase):
    def test_same_point_is_zero(self):
        dist = haversine_distance_km(12.971598, 77.594562, 12.971598, 77.594562)
        self.assertEqual(dist, 0.0)

    def test_known_bangalore_distance(self):
        # MG Road (12.9756, 77.6066) to Brigade Road (12.9733, 77.6074) ~ 270m (0.27km)
        dist = haversine_distance_km(12.9756, 77.6066, 12.9733, 77.6074)
        self.assertTrue(0.20 <= dist <= 0.35, f"Expected ~0.27km, got {dist}")

    def test_within_one_km_radius(self):
        lat_base, lon_base = 12.9716, 77.5946
        # Point ~400 meters away
        lat_near, lon_near = 12.9740, 77.5960
        self.assertTrue(is_within_radius(lat_base, lon_base, lat_near, lon_near, 1.0))

        # Point ~5 km away
        lat_far, lon_far = 13.0100, 77.5946
        self.assertFalse(is_within_radius(lat_base, lon_base, lat_far, lon_far, 1.0))

    def test_fuzzed_coordinates_preserve_general_area(self):
        orig_lat, orig_lon = 12.9716, 77.5946
        fuzz_lat, fuzz_lon = fuzz_coordinates_for_privacy(orig_lat, orig_lon)
        # Should be within 150m of original
        dist = haversine_distance_km(orig_lat, orig_lon, fuzz_lat, fuzz_lon)
        self.assertTrue(dist < 0.20, f"Fuzzing exceeded 200m: {dist}km")
        # Should not be identical
        self.assertNotEqual((orig_lat, orig_lon), (fuzz_lat, fuzz_lon))

    def test_approx_distance_formatting(self):
        self.assertIn("meters", calculate_approx_distance_text(0.05))
        self.assertIn("meters", calculate_approx_distance_text(0.4))
        self.assertIn("km", calculate_approx_distance_text(2.5))

if __name__ == '__main__':
    unittest.main()
