import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests
from sqlalchemy.orm import Session

from .config import settings
from .fcm import fcm_service
from .geospatial import haversine_distance_km
from .models import (
    FamilyEvent,
    FamilyLink,
    FamilyShareSession,
    LocationBreadcrumb,
    PushSubscription,
    SavedPlace,
    User,
    UsualRoutePoint,
)
from .notification_service import notification_service
from .privacy_crypto import (
    decrypt_coords,
    encrypt_coords,
    get_saved_place_coords,
    is_within_quiet_hours,
    route_grid_key,
)
from .websockets import notification_hub

logger = logging.getLogger("calm_family_events")


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _first_name(user: Optional[User]) -> str:
    if not user or not user.full_name:
        return "Your loved one"
    return user.full_name.strip().split()[0]


def _send_webhook_sync(url: str, title: str, body: str, extra: dict):
    try:
        if "ntfy" in url.lower():
            requests.post(
                url,
                data=body.encode("utf-8"),
                headers={"Title": title, "Priority": "high" if extra.get("urgent") else "default"},
                timeout=2.5,
            )
        elif "callmebot" in url.lower():
            sep = "&" if "?" in url else "?"
            from urllib.parse import quote_plus
            requests.get(f"{url}{sep}text={quote_plus(f'{title}: {body}')}", timeout=2.5)
        else:
            requests.post(url, json={"title": title, "body": body, **extra}, timeout=2.5)
    except Exception as exc:
        logger.debug("Optional webhook delivery skipped/failed for %s: %s", url, exc)


async def _dispatch_free_webhooks(title: str, body: str, extra: dict):
    tasks = []
    for raw_url in (settings.SMS_WEBHOOK_URL, settings.WHATSAPP_WEBHOOK_URL, settings.NTFY_TOPIC_URL):
        if raw_url and raw_url.strip():
            tasks.append(asyncio.to_thread(_send_webhook_sync, raw_url.strip(), title, body, extra))
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


def _category_permitted(link: FamilyLink, category: str, urgent: bool) -> bool:
    if link.status != "approved":
        return False
    if urgent or category == "sos":
        return True
    if category == "arrival_departure":
        return bool(link.share_arrival_departure)
    if category == "help_request":
        return bool(link.share_help_requests)
    if category in ("unusual_route", "long_stop"):
        return bool(link.share_unusual_route)
    return True


def serialize_family_event(ev: FamilyEvent) -> dict:
    meta = {}
    if ev.metadata_json:
        try:
            meta = json.loads(ev.metadata_json)
        except Exception:
            meta = {}
    created = _as_utc(ev.created_at) or datetime.now(timezone.utc)
    updated = _as_utc(ev.updated_at) or created
    return {
        "id": ev.id,
        "event_type": ev.event_type,
        "category": ev.category,
        "title": ev.title,
        "summary": ev.summary,
        "place_name": ev.place_name,
        "urgent": bool(ev.urgent),
        "grouped_count": ev.grouped_count or 1,
        "suppressed_by_quiet_hours": bool(meta.get("suppressed_by_quiet_hours", False)),
        "metadata": meta,
        "created_at": created.isoformat(),
        "updated_at": updated.isoformat(),
    }


async def emit_calm_family_event(
    db: Session,
    blind_user_id: str,
    *,
    event_type: str,
    category: str,
    title: str,
    summary: str,
    place_name: Optional[str] = None,
    urgent: bool = False,
    metadata: Optional[dict] = None,
) -> FamilyEvent:
    """
    Create or group a calm, human-readable family event and deliver push/WS/webhook
    notifications respecting quiet hours (unless urgent) and per-member consent.
    """
    now = datetime.now(timezone.utc)
    session = db.query(FamilyShareSession).filter(
        FamilyShareSession.blind_user_id == blind_user_id
    ).first()

    quiet_now = bool(
        session
        and is_within_quiet_hours(
            session.quiet_hours_enabled,
            session.quiet_hours_start,
            session.quiet_hours_end,
            session.quiet_hours_tz_offset_min or 0,
            now_utc=now,
        )
    )
    suppress_push = quiet_now and not urgent

    merged_meta = dict(metadata or {})
    merged_meta["suppressed_by_quiet_hours"] = suppress_push

    # Group repeated alerts within ALERT_GROUP_WINDOW_SECONDS to avoid alarm fatigue
    grouped = False
    cutoff = now - timedelta(seconds=settings.ALERT_GROUP_WINDOW_SECONDS)
    recent_same = (
        db.query(FamilyEvent)
        .filter(
            FamilyEvent.blind_user_id == blind_user_id,
            FamilyEvent.event_type == event_type,
            FamilyEvent.place_name == place_name,
            FamilyEvent.updated_at >= cutoff,
        )
        .order_by(FamilyEvent.updated_at.desc())
        .first()
    )

    if recent_same and not urgent:
        recent_same.grouped_count = (recent_same.grouped_count or 1) + 1
        recent_same.summary = summary
        recent_same.updated_at = now
        existing_meta = {}
        if recent_same.metadata_json:
            try:
                existing_meta = json.loads(recent_same.metadata_json)
            except Exception:
                existing_meta = {}
        existing_meta.update(merged_meta)
        recent_same.metadata_json = json.dumps(existing_meta)
        db.commit()
        db.refresh(recent_same)
        ev = recent_same
        grouped = True
    else:
        ev = FamilyEvent(
            blind_user_id=blind_user_id,
            event_type=event_type,
            category=category,
            title=title,
            summary=summary,
            place_name=place_name,
            urgent=urgent,
            grouped_count=1,
            metadata_json=json.dumps(merged_meta),
            created_at=now,
            updated_at=now,
        )
        db.add(ev)
        db.commit()
        db.refresh(ev)

    serialized = serialize_family_event(ev)
    ws_payload = {
        "type": event_type,
        "title": title,
        "body": summary,
        "blind_user_id": blind_user_id,
        "category": category,
        "urgent": urgent,
        "grouped": grouped,
        "quiet_suppressed": suppress_push,
        "event": serialized,
    }

    if session and session.invite_code:
        ws_payload["invite_code"] = session.invite_code
        await notification_hub.send_to_family_watchers(session.invite_code, ws_payload)

    links = db.query(FamilyLink).filter(
        FamilyLink.blind_user_id == blind_user_id,
        FamilyLink.status == "approved",
    ).all()
    permitted_user_ids = [lnk.family_user_id for lnk in links if _category_permitted(lnk, category, urgent)]

    for f_uid in permitted_user_ids:
        await notification_hub.send_to_user(f_uid, ws_payload)

    # Do not buzz phones with repeated grouped or non-urgent quiet-hours notifications
    deliveries = []
    if not suppress_push and (not grouped or urgent):
        # 1. Unified Multi-Channel Family Alert Service (Gmail + Telegram + Web Push for approved family members)
        dedup_ent = (
            merged_meta.get("alert_id")
            or merged_meta.get("request_id")
            or merged_meta.get("session_id")
            or place_name
            or ev.id
        )
        try:
            deliveries = await notification_service.dispatch_family_alert(
                db,
                blind_user_id,
                event_type=event_type,
                category=category,
                title=title,
                summary=summary,
                urgent=urgent,
                latitude=merged_meta.get("latitude"),
                longitude=merged_meta.get("longitude"),
                battery_level=merged_meta.get("battery_level"),
                dedup_entity=str(dedup_ent),
                extra=merged_meta,
            )
        except Exception as exc:
            logger.error("Multi-channel notification dispatch error for %s: %s", event_type, exc)

        # 2. Anonymous invite-code Web Push watchers (not tied to a FamilyLink user row)
        if session and session.invite_code:
            anon_subs = (
                db.query(PushSubscription)
                .filter(
                    PushSubscription.invite_code == session.invite_code,
                    PushSubscription.user_id.is_(None),
                )
                .all()
            )
            for sub in anon_subs:
                if sub.p256dh and sub.auth:
                    fcm_service.send_web_push(
                        subscription_info={
                            "endpoint": sub.endpoint,
                            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                        },
                        payload={
                            "title": title,
                            "body": summary,
                            "tag": f"{event_type}-{place_name or 'general'}",
                            "data": {
                                "url": f"/family/track/{session.invite_code}",
                                **ws_payload,
                            },
                        },
                    )

        if urgent or category in ("arrival_departure", "help_request", "unusual_route", "long_stop"):
            await _dispatch_free_webhooks(title, summary, {"urgent": urgent, "category": category, "event_type": event_type})

    setattr(ev, "_channel_deliveries", deliveries)
    return ev


async def process_calm_location_events(
    db: Session,
    blind_user: User,
    session: FamilyShareSession,
    lat: float,
    lng: float,
    now: datetime,
    *,
    fall_detected: bool = False,
):
    """Evaluate Saved Places geofencing, usual routes, 10-min unfamiliar stops, and fall urgency."""
    first = _first_name(blind_user)

    if fall_detected:
        await emit_calm_family_event(
            db,
            blind_user.id,
            event_type="FALL_DETECTED",
            category="sos",
            title="Urgent Fall Alert",
            summary=f"Possible fall detected for {first}. Please check in immediately.",
            urgent=True,
            metadata={"source": "smart_stick"},
        )

    # 1. Geofenced Saved Places (Home, Clinic, Work, Market, etc.)
    places = db.query(SavedPlace).filter(SavedPlace.user_id == blind_user.id).all()
    inside_any_place = False
    nearest_place_name = None
    nearest_dist_m = 1e9

    for place in places:
        coords = get_saved_place_coords(place)
        if not coords:
            continue
        p_lat, p_lng = coords
        dist_m = haversine_distance_km(lat, lng, p_lat, p_lng) * 1000.0
        if dist_m < nearest_dist_m:
            nearest_dist_m = dist_m
            nearest_place_name = place.name

        inside_now = dist_m <= (place.radius_m or 200.0)
        if inside_now:
            inside_any_place = True

        if not place.is_currently_inside and inside_now:
            place.is_currently_inside = True
            place.last_entered_at = now
            session.last_place_name = place.name
            db.commit()
            await emit_calm_family_event(
                db,
                blind_user.id,
                event_type="PLACE_ARRIVAL",
                category="arrival_departure",
                title=f"Reached {place.name}",
                summary=f"{first} reached {place.name} safely",
                place_name=place.name,
                urgent=False,
            )
        elif place.is_currently_inside and not inside_now:
            place.is_currently_inside = False
            place.last_exited_at = now
            db.commit()
            await emit_calm_family_event(
                db,
                blind_user.id,
                event_type="PLACE_DEPARTURE",
                category="arrival_departure",
                title=f"Left {place.name}",
                summary=f"{first} left {place.name}",
                place_name=place.name,
                urgent=False,
            )

    if inside_any_place and nearest_place_name:
        session.last_place_name = nearest_place_name
    elif nearest_place_name and nearest_dist_m <= 1500.0:
        session.last_place_name = f"Near {nearest_place_name}"
    elif session.safe_zone_lat is not None and session.was_inside_safe_zone:
        session.last_place_name = session.safe_zone_name or "Home Safe Zone"
    else:
        session.last_place_name = "On the move (outside saved places)"

    # 2. Usual Route Corridor Learning & Deviation Detection
    all_route_pts = db.query(UsualRoutePoint).filter(UsualRoutePoint.user_id == blind_user.id).all()
    established_pts = [p for p in all_route_pts if (p.visit_count or 0) >= 2]
    current_key = route_grid_key(lat, lng)

    if not inside_any_place and len(established_pts) >= 3:
        min_corridor_m = 1e9
        for rp in established_pts:
            rp_coords = decrypt_coords(rp.encrypted_centroid)
            if rp_coords:
                d_m = haversine_distance_km(lat, lng, rp_coords[0], rp_coords[1]) * 1000.0
                if d_m < min_corridor_m:
                    min_corridor_m = d_m
        if min_corridor_m > 350.0:
            await emit_calm_family_event(
                db,
                blind_user.id,
                event_type="UNUSUAL_ROUTE",
                category="unusual_route",
                title="Different Route Taken",
                summary=f"{first} is taking a different route than usual",
                place_name=current_key,
                urgent=False,
                metadata={"deviation_m": round(min_corridor_m)},
            )

    existing_cell = (
        db.query(UsualRoutePoint)
        .filter(UsualRoutePoint.user_id == blind_user.id, UsualRoutePoint.grid_key == current_key)
        .first()
    )
    if existing_cell:
        existing_cell.visit_count = (existing_cell.visit_count or 1) + 1
        existing_cell.last_seen_at = now
    else:
        db.add(
            UsualRoutePoint(
                user_id=blind_user.id,
                grid_key=current_key,
                encrypted_centroid=encrypt_coords(lat, lng),
                visit_count=1,
                last_seen_at=now,
            )
        )

    # 3. Unfamiliar 10-Minute Long Stop Detection
    if inside_any_place:
        session.stopped_anchor_enc = None
        session.stopped_anchor_since = None
        session.long_stop_alerted = False
    else:
        anchor_coords = decrypt_coords(session.stopped_anchor_enc) if session.stopped_anchor_enc else None
        if not anchor_coords or not session.stopped_anchor_since:
            session.stopped_anchor_enc = encrypt_coords(lat, lng)
            session.stopped_anchor_since = now
            session.long_stop_alerted = False
        else:
            drift_m = haversine_distance_km(lat, lng, anchor_coords[0], anchor_coords[1]) * 1000.0
            if drift_m > 50.0:
                session.stopped_anchor_enc = encrypt_coords(lat, lng)
                session.stopped_anchor_since = now
                session.long_stop_alerted = False
            elif not session.long_stop_alerted:
                stopped_secs = (now - _as_utc(session.stopped_anchor_since)).total_seconds()
                if stopped_secs >= settings.LONG_STOP_MINUTES * 60:
                    session.long_stop_alerted = True
                    mins = max(1, int(round(stopped_secs / 60)))
                    db.commit()
                    await emit_calm_family_event(
                        db,
                        blind_user.id,
                        event_type="LONG_STOP_UNFAMILIAR",
                        category="long_stop",
                        title="Extended Stop Detected",
                        summary=f"Stopped {mins} minutes in an unfamiliar place",
                        place_name=session.last_place_name or "Unfamiliar place",
                        urgent=False,
                        metadata={"stopped_minutes": mins},
                    )
    db.commit()


def prune_expired_location_history(db: Session) -> int:
    """Enforce raw location retention limit (default 7 days), keeping only event summaries."""
    now = datetime.now(timezone.utc)
    sessions = db.query(FamilyShareSession).all()
    deleted_total = 0
    for sess in sessions:
        retention_days = max(1, sess.raw_retention_days or settings.LOCATION_RETENTION_DAYS)
        cutoff = now - timedelta(days=retention_days)
        has_expired = (
            db.query(LocationBreadcrumb.id)
            .filter(
                LocationBreadcrumb.user_id == sess.blind_user_id,
                LocationBreadcrumb.recorded_at < cutoff,
            )
            .first()
        )
        if not has_expired:
            continue
        count = (
            db.query(LocationBreadcrumb)
            .filter(
                LocationBreadcrumb.user_id == sess.blind_user_id,
                LocationBreadcrumb.recorded_at < cutoff,
            )
            .delete(synchronize_session=False)
        )
        deleted_total += count or 0
    if deleted_total > 0:
        db.commit()
    else:
        db.rollback()
    return deleted_total
