import asyncio
import json
import logging
import secrets
from datetime import datetime, timezone
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import get_optional_user
from ..config import settings
from ..database import get_db
from ..geospatial import haversine_distance_km
from ..models import AssistantCommandLog, FamilyShareSession, SOSAlert, User
from ..notifications_helper import notify_family_event
from ..privacy_crypto import encrypt_coords
from ..schemas import (
    AssistantCommandLogCreate,
    AssistantCommandLogResponse,
    HardwareButtonEventRequest,
    LLMIntentParseRequest,
)
from ..websockets import notification_hub

logger = logging.getLogger("assistant_routes")

router = APIRouter(prefix="/api", tags=["Voice Assistant & Hardware Button"])

VALID_ASSISTANT_INTENTS = {
    "EMERGENCY_SOS",
    "VOLUNTEER_ASSISTANCE",
    "LIVE_ASSIST",
    "NAVIGATION",
    "NEAREST_BUS_STOP",
    "BUS_INFO",
    "CALL_FAMILY",
    "SEND_LOCATION",
    "WHERE_AM_I",
    "CANCEL",
    "STOP_SPEECH",
    "REPEAT",
    "HELP",
    "NAV_HOW_FAR",
    "NAV_STOP",
    "NAV_REPEAT",
    "SET_LANGUAGE",
    "UNKNOWN",
}


async def process_hardware_button_event(
    payload: HardwareButtonEventRequest,
    db: Session,
) -> dict:
    """
    Relay a physical button trigger (single_press | cancel | long_press) over WebSockets
    to active assistant web clients; if headless long_press occurs with a valid user_id
    and no connected web UI, dispatch backend SOS directly.
    """
    now = datetime.now(timezone.utc)
    normalized_action = "long_press" if payload.action == "press_hold_sos" else payload.action
    event_id = f"hw-{secrets.token_hex(6)}"

    event = {
        "type": "HARDWARE_BUTTON_EVENT",
        "event_id": event_id,
        "action": normalized_action,
        "device_id": payload.device_id,
        "source": payload.source,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "timestamp": now.isoformat(),
    }

    notification_hub.record_hardware_activity(payload.device_id, normalized_action)
    delivered = await notification_hub.broadcast_hardware_event(
        event,
        target_user_id=payload.user_id,
        target_client_id=payload.client_id,
    )

    backend_sos_alert_id = None
    if normalized_action == "long_press" and delivered == 0 and payload.user_id:
        user = db.query(User).filter(User.id == payload.user_id).first()
        if user:
            alert = SOSAlert(
                user_id=user.id,
                latitude=payload.latitude,
                longitude=payload.longitude,
                source="hardware_long_press",
                notes="Headless ESP32 hardware 3s long-press Emergency SOS",
                active=True,
                created_at=now,
            )
            db.add(alert)
            session = db.query(FamilyShareSession).filter(
                FamilyShareSession.blind_user_id == user.id
            ).first()
            if session:
                session.sos_active = True
                session.sos_triggered_at = now
                if payload.latitude is not None and payload.longitude is not None:
                    session.encrypted_last_coords = encrypt_coords(payload.latitude, payload.longitude)
                    session.last_latitude = None
                    session.last_longitude = None
                    session.last_seen_at = now
            db.commit()
            db.refresh(alert)
            backend_sos_alert_id = alert.id
            await notify_family_event(
                db,
                user.id,
                event_type="SOS_TRIGGERED",
                title="EMERGENCY SOS ALERT",
                body=f"{user.full_name} triggered hardware button Emergency SOS!",
                extra={
                    "alert_id": alert.id,
                    "latitude": payload.latitude,
                    "longitude": payload.longitude,
                    "sos_active": True,
                    "triggered_at": now.isoformat(),
                    "source": "hardware_long_press",
                },
            )

    return {
        "status": "ok",
        "event_id": event_id,
        "action": normalized_action,
        "delivered_clients": delivered,
        "backend_sos_alert_id": backend_sos_alert_id,
    }


@router.get("/assistant/config")
def get_assistant_config():
    return {
        "geocoder_provider": settings.GEOCODER_PROVIDER,
        "routing_provider": settings.ROUTING_PROVIDER if (
            settings.ROUTING_PROVIDER != "openrouteservice" or bool((settings.ORS_API_KEY or "").strip())
        ) else "osrm",
        "bus_provider_mode": settings.BUS_PROVIDER_MODE,
        "bus_mock_enabled": settings.BUS_MOCK_ENABLED,
        "gtfs_city": settings.GTFS_CITY_NAME,
        "llm_fallback_enabled": bool((settings.LLM_API_KEY or "").strip()),
        "cloud_stt_enabled": settings.CLOUD_STT_ENABLED,
        "cloud_tts_enabled": settings.CLOUD_TTS_ENABLED,
        "hardware_connected_count": len(notification_hub.hardware_connections),
        "hardware_devices": [
            {
                "device_id": dev_id,
                "connected_at": info.get("connected_at"),
                "last_seen_at": info.get("last_seen_at"),
                "last_action": info.get("last_action"),
            }
            for dev_id, info in notification_hub.hardware_connections.items()
        ],
    }


@router.get("/hardware/status")
def get_hardware_status():
    devices = [
        {
            "device_id": dev_id,
            "connected_at": info.get("connected_at"),
            "last_seen_at": info.get("last_seen_at"),
            "last_action": info.get("last_action"),
        }
        for dev_id, info in notification_hub.hardware_connections.items()
    ]
    return {
        "connected": len(devices) > 0,
        "device_count": len(devices),
        "devices": devices,
        "assistant_subscribers": len(notification_hub.assistant_subscribers),
    }


@router.post("/hardware/button-event")
async def trigger_hardware_button_event(
    payload: HardwareButtonEventRequest,
    db: Session = Depends(get_db),
):
    return await process_hardware_button_event(payload, db)


# ── Command Log Persistence & Deletion ────────────────────────────────────────
@router.get("/assistant/logs", response_model=List[AssistantCommandLogResponse])
def list_assistant_command_logs(
    client_id: Optional[str] = Query(default=None, max_length=64),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    query = db.query(AssistantCommandLog)
    if current_user:
        if client_id:
            query = query.filter(
                (AssistantCommandLog.user_id == current_user.id)
                | (AssistantCommandLog.client_id == client_id)
            )
        else:
            query = query.filter(AssistantCommandLog.user_id == current_user.id)
    elif client_id:
        query = query.filter(AssistantCommandLog.client_id == client_id)
    else:
        return []

    rows = query.order_by(AssistantCommandLog.created_at.desc()).limit(limit).all()
    return [
        AssistantCommandLogResponse(
            id=r.id,
            transcript=r.transcript,
            intent=r.intent,
            result=r.result,
            status=r.status,
            source=r.source,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/assistant/logs", response_model=AssistantCommandLogResponse)
def create_assistant_command_log(
    data: AssistantCommandLogCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    if not current_user and not data.client_id:
        raise HTTPException(status_code=400, detail="client_id is required when unauthenticated")
    row = AssistantCommandLog(
        user_id=current_user.id if current_user else None,
        client_id=data.client_id,
        transcript=data.transcript.strip(),
        intent=data.intent.strip().upper(),
        result=data.result.strip(),
        status=data.status.strip(),
        source=data.source.strip(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return AssistantCommandLogResponse(
        id=row.id,
        transcript=row.transcript,
        intent=row.intent,
        result=row.result,
        status=row.status,
        source=row.source,
        created_at=row.created_at,
    )


@router.delete("/assistant/logs")
def clear_assistant_command_logs(
    client_id: Optional[str] = Query(default=None, max_length=64),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    if not current_user and not client_id:
        raise HTTPException(status_code=400, detail="Sign in or specify client_id to delete history")
    query = db.query(AssistantCommandLog)
    if current_user and client_id:
        query = query.filter(
            (AssistantCommandLog.user_id == current_user.id)
            | (AssistantCommandLog.client_id == client_id)
        )
    elif current_user:
        query = query.filter(AssistantCommandLog.user_id == current_user.id)
    else:
        query = query.filter(AssistantCommandLog.client_id == client_id)
    deleted = query.delete(synchronize_session=False)
    db.commit()
    return {"status": "deleted", "deleted_count": int(deleted or 0)}


# ── Optional Env-Configured LLM Fallback Intent Classifier ────────────────────
@router.post("/assistant/parse-llm")
async def parse_intent_via_llm(data: LLMIntentParseRequest):
    api_key = (settings.LLM_API_KEY or "").strip()
    api_url = (settings.LLM_API_URL or "").strip()
    if not api_key:
        return {
            "enabled": False,
            "intent": "UNKNOWN",
            "confidence": 0.0,
            "place": None,
            "routeNumber": None,
            "reason": "Optional LLM API key not configured; rule-based matcher active.",
        }

    system_prompt = (
        "You classify a blind/low-vision user's spoken request for SightLink AI into JSON ONLY. "
        "The user may speak or type in English, Hindi (Devanagari or Romanized Hinglish), Tamil (Tamil script or Tanglish), "
        "Telugu (Telugu script or Tenglish), or Kannada (Kannada script or Kanglish). "
        "Allowed intents: EMERGENCY_SOS, VOLUNTEER_ASSISTANCE, LIVE_ASSIST, NAVIGATION, BUS_INFO, "
        "CALL_FAMILY, SEND_LOCATION, WHERE_AM_I, CANCEL, STOP_SPEECH, REPEAT, HELP, NAV_HOW_FAR, "
        "NAV_STOP, NAV_REPEAT, SET_LANGUAGE, UNKNOWN. "
        'Return strict JSON: {"intent": "...", "place": string|null, "routeNumber": string|null, "confidence": 0.0..1.0}.'
    )
    user_msg = f'Transcript: "{data.transcript}" | Lang: {data.language} | NavActive: {data.navigation_active}'

    target_url = api_url or "https://api.openai.com/v1/chat/completions"
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            if "generativelanguage.googleapis.com" in target_url:
                resp = await client.post(
                    target_url,
                    params={"key": api_key} if "key=" not in target_url else None,
                    json={
                        "contents": [{"parts": [{"text": f"{system_prompt}\n{user_msg}"}]}],
                        "generationConfig": {"temperature": 0.0, "responseMimeType": "application/json"},
                    },
                )
                resp.raise_for_status()
                raw_json = resp.json()
                text_out = (
                    raw_json.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text", "{}")
                )
            else:
                resp = await client.post(
                    target_url,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": settings.LLM_MODEL,
                        "temperature": 0,
                        "response_format": {"type": "json_object"},
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_msg},
                        ],
                    },
                )
                resp.raise_for_status()
                raw_json = resp.json()
                text_out = raw_json.get("choices", [{}])[0].get("message", {}).get("content", "{}")

        parsed = json.loads(text_out)
        intent = str(parsed.get("intent", "UNKNOWN")).upper().strip()
        if intent not in VALID_ASSISTANT_INTENTS:
            intent = "UNKNOWN"
        return {
            "enabled": True,
            "intent": intent,
            "place": parsed.get("place"),
            "routeNumber": parsed.get("routeNumber"),
            "confidence": float(parsed.get("confidence", 0.7 if intent != "UNKNOWN" else 0.0)),
        }
    except Exception as exc:
        logger.warning("Optional LLM intent fallback error: %s", exc)
        return {
            "enabled": True,
            "intent": "UNKNOWN",
            "confidence": 0.0,
            "place": None,
            "routeNumber": None,
            "reason": "LLM fallback unavailable; handled locally.",
        }


# ── Optional Cloud STT / TTS Adapter Endpoint (Disabled by Default) ───────────
@router.post("/assistant/cloud-speech")
def cloud_speech_adapter():
    if not (settings.CLOUD_STT_ENABLED or settings.CLOUD_TTS_ENABLED):
        return {
            "enabled": False,
            "message": "Cloud STT/TTS adapter is disabled by default; Web Speech API active.",
        }
    return {
        "enabled": True,
        "cloud_stt_enabled": settings.CLOUD_STT_ENABLED,
        "cloud_tts_enabled": settings.CLOUD_TTS_ENABLED,
        "message": "Cloud speech endpoint ready for provider binding.",
    }


NEURAL_TTS_VOICES = {
    "kn": "kn-IN-SapnaNeural",
    "kn-in": "kn-IN-SapnaNeural",
    "hi": "hi-IN-SwaraNeural",
    "hi-in": "hi-IN-SwaraNeural",
    "ta": "ta-IN-PallaviNeural",
    "ta-in": "ta-IN-PallaviNeural",
    "te": "te-IN-ShrutiNeural",
    "te-in": "te-IN-ShrutiNeural",
    "en-us": "en-US-JennyNeural",
    "en": "en-IN-NeerjaNeural",
    "en-in": "en-IN-NeerjaNeural",
}
_TTS_AUDIO_CACHE: dict[tuple[str, str, str], bytes] = {}


class NeuralTtsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=700)
    lang: str = Field(default="kn-IN", max_length=24)
    rate: float = Field(default=1.0, ge=0.5, le=2.0)


@router.post("/assistant/tts")
async def synthesize_neural_tts(data: NeuralTtsRequest):
    """Synthesize spoken MP3 audio for Indian languages when browser/OS SAPI voices are missing."""
    try:
        import edge_tts
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Neural TTS unavailable: {exc}")

    lang_key = (data.lang or "en-IN").strip().lower()
    short_key = lang_key.split("-")[0]
    voice = NEURAL_TTS_VOICES.get(lang_key) or NEURAL_TTS_VOICES.get(short_key) or "en-IN-NeerjaNeural"
    pct = max(-45, min(60, round((float(data.rate or 1.0) - 1.0) * 100)))
    rate_str = f"{pct:+d}%"
    clean_text = data.text.strip()
    cache_key = (voice, rate_str, clean_text)

    if cache_key in _TTS_AUDIO_CACHE:
        return Response(content=_TTS_AUDIO_CACHE[cache_key], media_type="audio/mpeg")

    try:
        comm = edge_tts.Communicate(clean_text, voice, rate=rate_str)
        buf = bytearray()
        async for chunk in comm.stream():
            if chunk.get("type") == "audio":
                buf.extend(chunk["data"])
        audio_bytes = bytes(buf)
        if not audio_bytes:
            raise RuntimeError("Empty TTS audio stream")
        if len(_TTS_AUDIO_CACHE) >= 64:
            _TTS_AUDIO_CACHE.pop(next(iter(_TTS_AUDIO_CACHE)))
        _TTS_AUDIO_CACHE[cache_key] = audio_bytes
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as exc:
        logger.warning("Neural TTS synthesis error (%s): %s", voice, exc)
        raise HTTPException(status_code=503, detail="Neural TTS synthesis failed")


# ── Free Geocoding & Walking Routing Server Proxy (Nominatim / Photon / OSRM / ORS) ──
@router.get("/assistant/geocode")
async def geocode_place(
    q: str = Query(..., min_length=1, max_length=200),
    lat: Optional[float] = Query(default=None, ge=-90.0, le=90.0),
    lng: Optional[float] = Query(default=None, ge=-180.0, le=180.0),
    limit: int = Query(default=4, ge=1, le=8),
):
    headers = {"User-Agent": "SightLinkAI/2.0 (accessibility-voice-assistant)"}
    provider = settings.GEOCODER_PROVIDER
    results = []

    try:
        async with httpx.AsyncClient(timeout=6.0, headers=headers) as client:
            if provider == "photon":
                params = {"q": q, "limit": limit}
                if lat is not None and lng is not None:
                    params["lat"] = lat
                    params["lon"] = lng
                resp = await client.get(settings.PHOTON_URL, params=params)
                resp.raise_for_status()
                for feat in resp.json().get("features", []):
                    coords = feat.get("geometry", {}).get("coordinates", [])
                    props = feat.get("properties", {})
                    if len(coords) < 2:
                        continue
                    f_lng, f_lat = float(coords[0]), float(coords[1])
                    parts = [p for p in (props.get("name"), props.get("street"), props.get("city"), props.get("state")) if p]
                    display = ", ".join(parts) or q
                    dist_m = round(haversine_distance_km(lat, lng, f_lat, f_lng) * 1000) if (lat is not None and lng is not None) else None
                    results.append({
                        "display_name": display,
                        "short_name": parts[0] if parts else display,
                        "street": props.get("street") or "",
                        "latitude": f_lat,
                        "longitude": f_lng,
                        "type": props.get("osm_value") or "place",
                        "distance_m": dist_m,
                    })
            else:
                params = {"format": "jsonv2", "q": q, "limit": limit, "addressdetails": 1}
                if lat is not None and lng is not None:
                    delta = 0.25
                    params["viewbox"] = f"{lng - delta},{lat + delta},{lng + delta},{lat - delta}"
                    params["bounded"] = 0
                resp = await client.get(f"{settings.NOMINATIM_URL}/search", params=params)
                resp.raise_for_status()
                for item in resp.json():
                    f_lat = float(item["lat"])
                    f_lng = float(item["lon"])
                    addr = item.get("address") or {}
                    road = addr.get("road") or addr.get("suburb") or addr.get("neighbourhood") or ""
                    short = item.get("name") or item.get("display_name", "").split(",")[0]
                    dist_m = round(haversine_distance_km(lat, lng, f_lat, f_lng) * 1000) if (lat is not None and lng is not None) else None
                    results.append({
                        "display_name": item.get("display_name") or short,
                        "short_name": short,
                        "street": road,
                        "latitude": f_lat,
                        "longitude": f_lng,
                        "type": item.get("type") or "place",
                        "distance_m": dist_m,
                    })
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Geocoder request failed: {exc}")

    return {"provider": provider, "query": q, "matches": results}


@router.get("/assistant/nearest-bus-stop")
async def get_nearest_bus_stop(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lng: float = Query(..., ge=-180.0, le=180.0),
    limit: int = Query(default=5, ge=1, le=10),
):
    """
    Find nearby bus stops within walking distance of the given coordinates,
    returning distance in meters and walking ETA in minutes.
    """
    headers = {"User-Agent": "SightLinkAI/2.0 (accessibility-voice-assistant)"}
    stops = []
    delta = 0.035

    # 1. First search: tightly bounded query around user's GPS
    try:
        async with httpx.AsyncClient(timeout=6.0, headers=headers) as client:
            params = {
                "format": "jsonv2",
                "q": "bus stop",
                "limit": 10,
                "addressdetails": 1,
                "viewbox": f"{lng - delta},{lat + delta},{lng + delta},{lat - delta}",
                "bounded": 1,
            }
            resp = await client.get(f"{settings.NOMINATIM_URL}/search", params=params)
            if resp.status_code == 200:
                for item in resp.json():
                    try:
                        f_lat = float(item["lat"])
                        f_lng = float(item["lon"])
                    except (ValueError, TypeError):
                        continue
                    dist_m = round(haversine_distance_km(lat, lng, f_lat, f_lng) * 1000)
                    raw_name = item.get("name") or (item.get("display_name") or "Bus Stop").split(",")[0].strip()
                    name = raw_name if "bus stop" in raw_name.lower() or "station" in raw_name.lower() else f"{raw_name} Bus Stop"
                    walking_min = max(1, round(dist_m / 75))
                    stops.append({
                        "name": name,
                        "short_name": raw_name,
                        "display_name": item.get("display_name") or name,
                        "distance_m": dist_m,
                        "walking_minutes": walking_min,
                        "latitude": f_lat,
                        "longitude": f_lng,
                    })
    except Exception as exc:
        logger.warning("Nearest bus stop lookup error: %s", exc)

    # 2. Second search: if tightly bounded yielded nothing, broaden viewbox
    if not stops:
        try:
            async with httpx.AsyncClient(timeout=6.0, headers=headers) as client:
                params = {
                    "format": "jsonv2",
                    "q": "bus stop",
                    "limit": 10,
                    "addressdetails": 1,
                    "viewbox": f"{lng - 0.12},{lat + 0.12},{lng + 0.12},{lat - 0.12}",
                    "bounded": 0,
                }
                resp = await client.get(f"{settings.NOMINATIM_URL}/search", params=params)
                if resp.status_code == 200:
                    for item in resp.json():
                        try:
                            f_lat = float(item["lat"])
                            f_lng = float(item["lon"])
                        except (ValueError, TypeError):
                            continue
                        dist_m = round(haversine_distance_km(lat, lng, f_lat, f_lng) * 1000)
                        raw_name = item.get("name") or (item.get("display_name") or "Bus Stop").split(",")[0].strip()
                        name = raw_name if "bus stop" in raw_name.lower() or "station" in raw_name.lower() else f"{raw_name} Bus Stop"
                        walking_min = max(1, round(dist_m / 75))
                        stops.append({
                            "name": name,
                            "short_name": raw_name,
                            "display_name": item.get("display_name") or name,
                            "distance_m": dist_m,
                            "walking_minutes": walking_min,
                            "latitude": f_lat,
                            "longitude": f_lng,
                        })
        except Exception as exc:
            logger.warning("Broadened nearest bus stop lookup error: %s", exc)

    if not stops:
        return {"success": False, "stops": [], "nearest_stop": None}

    # Deduplicate and sort by distance ascending
    unique_stops = []
    seen = set()
    for s in stops:
        key = (round(s["latitude"], 4), round(s["longitude"], 4))
        if key not in seen:
            seen.add(key)
            unique_stops.append(s)

    unique_stops.sort(key=lambda s: s["distance_m"])
    return {
        "success": True,
        "nearest_stop": unique_stops[0],
        "stops": unique_stops[:limit],
    }


@router.get("/assistant/route")
async def get_walking_route(
    from_lat: float = Query(..., ge=-90.0, le=90.0),
    from_lng: float = Query(..., ge=-180.0, le=180.0),
    to_lat: float = Query(..., ge=-90.0, le=90.0),
    to_lng: float = Query(..., ge=-180.0, le=180.0),
):
    use_ors = settings.ROUTING_PROVIDER == "openrouteservice" and bool((settings.ORS_API_KEY or "").strip())
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            if use_ors:
                resp = await client.post(
                    f"{settings.ORS_BASE_URL}/geojson",
                    headers={"Authorization": settings.ORS_API_KEY, "Content-Type": "application/json"},
                    json={"coordinates": [[from_lng, from_lat], [to_lng, to_lat]], "instructions": True},
                )
                resp.raise_for_status()
                gj = resp.json()
                feat = (gj.get("features") or [{}])[0]
                props = feat.get("properties") or {}
                summary = props.get("summary") or {}
                coords = feat.get("geometry", {}).get("coordinates", [])
                poly = [{"latitude": float(la), "longitude": float(ln)} for ln, la in coords]
                steps = []
                for seg in props.get("segments", []):
                    for st in seg.get("steps", []):
                        way_idx = (st.get("way_points") or [0])[0]
                        pt = poly[way_idx] if way_idx < len(poly) else {"latitude": from_lat, "longitude": from_lng}
                        steps.append({
                            "instruction": st.get("instruction") or "Continue walking",
                            "road": st.get("name") or "",
                            "distance_m": round(float(st.get("distance") or 0)),
                            "duration_s": round(float(st.get("duration") or 0)),
                            "latitude": pt["latitude"],
                            "longitude": pt["longitude"],
                            "maneuver_type": "turn",
                            "modifier": "",
                        })
                return {
                    "provider": "openrouteservice",
                    "distance_m": round(float(summary.get("distance") or 0)),
                    "duration_s": round(float(summary.get("duration") or 0)),
                    "geometry": poly,
                    "steps": steps,
                }

            # Default: Free OSRM foot routing
            resp = await client.get(
                f"{settings.OSRM_BASE_URL}/{from_lng},{from_lat};{to_lng},{to_lat}",
                params={"steps": "true", "geometries": "geojson", "overview": "full"},
            )
            resp.raise_for_status()
            data = resp.json()
            route = (data.get("routes") or [{}])[0]
            leg = (route.get("legs") or [{}])[0]
            poly = [
                {"latitude": float(la), "longitude": float(ln)}
                for ln, la in (route.get("geometry") or {}).get("coordinates", [])
            ]
            steps = []
            for st in leg.get("steps", []):
                maneuver = st.get("maneuver") or {}
                loc = maneuver.get("location") or [from_lng, from_lat]
                steps.append({
                    "instruction": None,
                    "road": st.get("name") or "",
                    "distance_m": round(float(st.get("distance") or 0)),
                    "duration_s": round(float(st.get("duration") or 0)),
                    "latitude": float(loc[1]),
                    "longitude": float(loc[0]),
                    "maneuver_type": maneuver.get("type") or "continue",
                    "modifier": maneuver.get("modifier") or "",
                })
            return {
                "provider": "osrm",
                "distance_m": round(float(route.get("distance") or 0)),
                "duration_s": round(float(route.get("duration") or 0)),
                "geometry": poly,
                "steps": steps,
            }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Routing engine failed: {exc}")

