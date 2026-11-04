import math
import random

# Earth radius in kilometers
EARTH_RADIUS_KM = 6371.0088

def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees) using the Haversine formula.
    Returns distance in kilometers.
    """
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    
    a = (math.sin(d_lat / 2.0) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2.0) ** 2)
    
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    distance = EARTH_RADIUS_KM * c
    return round(distance, 3)

def is_within_radius(lat1: float, lon1: float, lat2: float, lon2: float, radius_km: float) -> bool:
    """Checks whether point 2 is within radius_km of point 1."""
    return haversine_distance_km(lat1, lon1, lat2, lon2) <= radius_km

def calculate_approx_distance_text(distance_km: float) -> str:
    """Format distance into human-readable text for TTS and UI."""
    if distance_km < 0.1:
        meters = int(distance_km * 1000)
        return f"{meters} meters away"
    elif distance_km < 1.0:
        meters = int(round(distance_km * 10) * 100)
        return f"approx {meters} meters away"
    else:
        return f"approx {distance_km:.1f} km away"

def fuzz_coordinates_for_privacy(lat: float, lon: float, fuzz_radius_meters: float = 80.0) -> tuple[float, float]:
    """
    Apply slight coordinate jitter before mutual match acceptance
    to prevent exact address leakage while still showing proximity.
    """
    # 1 deg lat is approx 111,000 meters
    delta_lat = (random.uniform(-fuzz_radius_meters, fuzz_radius_meters)) / 111000.0
    # 1 deg lon is approx 111,000 * cos(lat)
    cos_lat = math.cos(math.radians(lat))
    if abs(cos_lat) < 1e-6:
        cos_lat = 1.0
    delta_lon = (random.uniform(-fuzz_radius_meters, fuzz_radius_meters)) / (111000.0 * cos_lat)
    
    return round(lat + delta_lat, 5), round(lon + delta_lon, 5)
