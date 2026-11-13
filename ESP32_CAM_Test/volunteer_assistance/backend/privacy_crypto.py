import base64
import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from .config import settings


def _derive_fernet_key() -> bytes:
    configured = (settings.LOCATION_ENCRYPTION_KEY or "").strip()
    if configured:
        try:
            raw = configured.encode("utf-8")
            Fernet(raw)
            return raw
        except Exception:
            digest = hashlib.sha256(configured.encode("utf-8")).digest()
            return base64.urlsafe_b64encode(digest)

    digest = hashlib.sha256(f"sightlink-loc:{settings.SECRET_KEY}".encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _get_fernet() -> Fernet:
    return Fernet(_derive_fernet_key())


def encrypt_coords(lat: float, lng: float) -> str:
    """Encrypt GPS latitude/longitude coordinates at rest using AES/Fernet."""
    payload = json.dumps({"lat": round(float(lat), 7), "lng": round(float(lng), 7)}, separators=(",", ":"))
    token = _get_fernet().encrypt(payload.encode("utf-8")).decode("utf-8")
    return f"enc:v1:{token}"


def decrypt_coords(ciphertext: Optional[str]) -> Optional[tuple[float, float]]:
    """Decrypt coordinates encrypted by `encrypt_coords`."""
    if not ciphertext:
        return None
    raw = ciphertext[7:] if ciphertext.startswith("enc:v1:") else ciphertext
    try:
        plain = _get_fernet().decrypt(raw.encode("utf-8")).decode("utf-8")
        obj = json.loads(plain)
        return float(obj["lat"]), float(obj["lng"])
    except (InvalidToken, ValueError, KeyError, TypeError):
        return None


def get_breadcrumb_coords(crumb) -> Optional[tuple[float, float]]:
    if getattr(crumb, "encrypted_coords", None):
        coords = decrypt_coords(crumb.encrypted_coords)
        if coords is not None:
            return coords
    if crumb.latitude is not None and crumb.longitude is not None:
        if crumb.latitude != 0.0 or crumb.longitude != 0.0:
            return float(crumb.latitude), float(crumb.longitude)
    return None


def get_saved_place_coords(place) -> Optional[tuple[float, float]]:
    if getattr(place, "encrypted_coords", None):
        return decrypt_coords(place.encrypted_coords)
    return None


def get_session_last_coords(session) -> Optional[tuple[float, float]]:
    if getattr(session, "encrypted_last_coords", None):
        coords = decrypt_coords(session.encrypted_last_coords)
        if coords is not None:
            return coords
    if session.last_latitude is not None and session.last_longitude is not None:
        return float(session.last_latitude), float(session.last_longitude)
    return None


def is_within_quiet_hours(
    enabled: bool,
    start_hhmm: Optional[str],
    end_hhmm: Optional[str],
    tz_offset_min: int = 0,
    now_utc: Optional[datetime] = None,
) -> bool:
    if not enabled or not start_hhmm or not end_hhmm:
        return False
    try:
        sh, sm = [int(p) for p in start_hhmm.strip().split(":")[:2]]
        eh, em = [int(p) for p in end_hhmm.strip().split(":")[:2]]
        start_min = (sh % 24) * 60 + (sm % 60)
        end_min = (eh % 24) * 60 + (em % 60)
    except Exception:
        return False

    ref = (now_utc or datetime.now(timezone.utc)) + timedelta(minutes=tz_offset_min or 0)
    cur_min = ref.hour * 60 + ref.minute
    if start_min == end_min:
        return True
    if start_min < end_min:
        return start_min <= cur_min < end_min
    return cur_min >= start_min or cur_min < end_min


def route_grid_key(lat: float, lng: float, step_deg: float = 0.0014) -> str:
    """Quantize lat/lng into an ~150m spatial cell for privacy-preserving corridor learning."""
    lat_cell = round(float(lat) / step_deg)
    lng_cell = round(float(lng) / step_deg)
    return f"{lat_cell}:{lng_cell}"

