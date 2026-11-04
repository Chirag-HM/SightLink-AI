import requests
from fastapi import APIRouter, Query
from ..config import settings
from ..schemas import StickGPSSync

router = APIRouter(prefix="/api/stick", tags=["ESP8266 Stick Gateway"])

# In-memory cached stick coordinates for quick lookup
latest_stick_data = {
    "fix": False,
    "latitude": None,
    "longitude": None,
    "satellites": 0,
    "distance_cm": None,
    "button_pressed": False,
    "source": "uninitialized"
}

@router.get("/gps", response_model=StickGPSSync)
def fetch_esp8266_gps(ip: str = Query(default=settings.ESP8266_IP)):
    """
    Directly query the existing, unmodified ESP8266 Smart Blind Stick
    firmware endpoint at http://<ESP_IP>/gps or /status.
    """
    url = f"http://{ip}/status"
    try:
        resp = requests.get(url, timeout=settings.ESP8266_TIMEOUT_SECONDS)
        if resp.status_code == 200:
            data = resp.json()
            # Keys returned by ESP8266 main.cpp:
            # {"gps_fix": bool, "latitude": float, "longitude": float, "satellites": int, "distance_cm": float, "button": bool}
            has_fix = bool(data.get("gps_fix", False))
            lat = data.get("latitude")
            lon = data.get("longitude")
            
            latest_stick_data["fix"] = has_fix and (lat is not None) and (lon is not None)
            latest_stick_data["latitude"] = float(lat) if lat is not None else None
            latest_stick_data["longitude"] = float(lon) if lon is not None else None
            latest_stick_data["satellites"] = int(data.get("satellites", 0))
            latest_stick_data["distance_cm"] = float(data.get("distance_cm", 999.0))
            latest_stick_data["button_pressed"] = bool(data.get("button", False))
            latest_stick_data["source"] = f"esp8266@{ip}"

            return StickGPSSync(**latest_stick_data)
    except Exception:
        # Fall back to testing /gps endpoint
        try:
            resp2 = requests.get(f"http://{ip}/gps", timeout=settings.ESP8266_TIMEOUT_SECONDS)
            if resp2.status_code == 200:
                d = resp2.json()
                has_fix = bool(d.get("fix", False))
                lat = d.get("latitude")
                lon = d.get("longitude")
                latest_stick_data["fix"] = has_fix and (lat is not None) and (lon is not None)
                latest_stick_data["latitude"] = float(lat) if lat is not None else None
                latest_stick_data["longitude"] = float(lon) if lon is not None else None
                latest_stick_data["satellites"] = int(d.get("satellites", 0))
                latest_stick_data["source"] = f"esp8266@{ip}"
                return StickGPSSync(**latest_stick_data)
        except Exception:
            pass

    # If ESP8266 is unreachable, return last known or clean fallback
    return StickGPSSync(
        fix=latest_stick_data.get("fix", False),
        latitude=latest_stick_data.get("latitude"),
        longitude=latest_stick_data.get("longitude"),
        satellites=latest_stick_data.get("satellites", 0),
        distance_cm=latest_stick_data.get("distance_cm"),
        button_pressed=latest_stick_data.get("button_pressed")
    )

@router.post("/gps-sync")
def sync_stick_gps(data: StickGPSSync):
    """
    Companion endpoint for voice_bus.py or external scripts to push
    ESP8266 GPS packets into the assistance backend.
    """
    latest_stick_data.update(data.model_dump())
    latest_stick_data["source"] = "push_sync"
    return {"status": "synced", "latest": latest_stick_data}
