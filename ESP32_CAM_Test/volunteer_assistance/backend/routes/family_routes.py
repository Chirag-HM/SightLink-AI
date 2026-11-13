from urllib.parse import quote_plus
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_optional_user, require_role
from ..config import settings
from ..database import get_db
from ..family_events import (
    _as_utc,
    emit_calm_family_event,
    process_calm_location_events,
    serialize_family_event,
)
from ..geospatial import haversine_distance_km
from ..models import (
    AssistanceRequest,
    FamilyEvent,
    FamilyLink,
    FamilyShareSession,
    LiveAssistSession,
    LiveAssistStatus,
    LocationBreadcrumb,
    NotificationDeliveryLog,
    RequestStatus,
    SavedPlace,
    SOSAlert,
    TelegramLink,
    User,
    UserRole,
    UsualRoutePoint,
)
from ..notifications_helper import build_assistance_response, notify_family_event
from ..privacy_crypto import (
    encrypt_coords,
    get_breadcrumb_coords,
    get_saved_place_coords,
    get_session_last_coords,
    is_within_quiet_hours,
)
from ..schemas import (
    FamilyCheckInAlertRequest,
    FamilyConsentUpdate,
    FamilyLinkRequest,
    FamilyMemberChannelPreferencesUpdate,
    FamilyMemberConfirmRequest,
    FamilyMemberPermissionsUpdate,
    FamilyNavigationEventRequest,
    FamilyTelemetryUpdate,
    SafeZoneUpdate,
    SavedPlaceCreate,
)
from ..websockets import notification_hub

router = APIRouter(prefix="/api/family", tags=["Family Live Tracking & Calm Updates"])


def _iso_utc(dt: Optional[datetime]) -> Optional[str]:
    u = _as_utc(dt)
    return u.isoformat() if u else None


def _ensure_share_session(db: Session, blind_user: User) -> FamilyShareSession:
    session = db.query(FamilyShareSession).filter(
        FamilyShareSession.blind_user_id == blind_user.id
    ).first()
    if not session:
        session = FamilyShareSession(
            blind_user_id=blind_user.id,
            invite_code=f"SL-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}",
            consent_given=False,
            is_sharing=False,
            is_paused=False,
            raw_retention_days=settings.LOCATION_RETENTION_DAYS,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
    return session


def _refresh_timed_pause(db: Session, session: FamilyShareSession) -> None:
    if session.is_paused and session.paused_until:
        now = datetime.now(timezone.utc)
        pu = _as_utc(session.paused_until)
        if pu and pu <= now:
            session.is_paused = False
            session.paused_until = None
            session.updated_at = now
            db.commit()


def _serialize_share_session(session: FamilyShareSession) -> dict:
    last_coords = get_session_last_coords(session)
    paused_until_utc = _as_utc(session.paused_until)
    now = datetime.now(timezone.utc)
    paused_min_left = (
        max(1, int((paused_until_utc - now).total_seconds() // 60) + 1)
        if session.is_paused and paused_until_utc and paused_until_utc > now
        else None
    )
    return {
        "invite_code": session.invite_code,
        "consent_given": session.consent_given,
        "is_sharing": session.is_sharing,
        "is_paused": session.is_paused,
        "paused_until": paused_until_utc.isoformat() if paused_until_utc else None,
        "paused_minutes_remaining": paused_min_left,
        "quiet_hours": {
            "enabled": bool(session.quiet_hours_enabled),
            "start": session.quiet_hours_start or "22:00",
            "end": session.quiet_hours_end or "07:00",
            "tz_offset_min": session.quiet_hours_tz_offset_min or 0,
            "active_now": is_within_quiet_hours(
                bool(session.quiet_hours_enabled),
                session.quiet_hours_start,
                session.quiet_hours_end,
                session.quiet_hours_tz_offset_min or 0,
                now_utc=now,
            ),
        },
        "caregiver_managed": bool(session.caregiver_managed),
        "caregiver_name": session.caregiver_name,
        "raw_retention_days": session.raw_retention_days or settings.LOCATION_RETENTION_DAYS,
        "last_place_name": session.last_place_name,
        "safe_zone": {
            "name": session.safe_zone_name,
            "lat": session.safe_zone_lat,
            "lng": session.safe_zone_lng,
            "radius_m": session.safe_zone_radius_m,
            "inside": session.was_inside_safe_zone,
        } if session.safe_zone_lat is not None else None,
        "last_latitude": last_coords[0] if last_coords else None,
        "last_longitude": last_coords[1] if last_coords else None,
        "battery_level": session.battery_level,
        "last_seen_at": _iso_utc(session.last_seen_at),
        "sos_active": session.sos_active,
    }


def _serialize_saved_place(place: SavedPlace) -> dict:
    coords = get_saved_place_coords(place)
    return {
        "id": place.id,
        "name": place.name,
        "category": place.category,
        "latitude": coords[0] if coords else None,
        "longitude": coords[1] if coords else None,
        "radius_m": place.radius_m,
        "is_currently_inside": bool(place.is_currently_inside),
        "last_entered_at": _iso_utc(place.last_entered_at),
        "last_exited_at": _iso_utc(place.last_exited_at),
    }


def _serialize_member_link(db: Session, lnk: FamilyLink) -> dict:
    fam_user = db.query(User).filter(User.id == lnk.family_user_id).first()
    tg_link = db.query(TelegramLink).filter(
        TelegramLink.user_id == lnk.family_user_id,
        TelegramLink.is_active == True,
    ).first()
    return {
        "id": lnk.id,
        "family_user_id": lnk.family_user_id,
        "family_name": fam_user.full_name if fam_user else "Family Guardian",
        "family_email": fam_user.email if fam_user else None,
        "telegram_connected": bool(tg_link and tg_link.is_active and tg_link.chat_id),
        "relationship_label": lnk.relationship_label,
        "status": lnk.status or "approved",
        "share_arrival_departure": bool(lnk.share_arrival_departure),
        "share_help_requests": bool(lnk.share_help_requests),
        "share_unusual_route": bool(lnk.share_unusual_route),
        "share_live_map": bool(lnk.share_live_map),
        "notify_email": bool(getattr(lnk, "notify_email", True)),
        "notify_telegram": bool(getattr(lnk, "notify_telegram", True)),
        "notify_web_push": bool(getattr(lnk, "notify_web_push", True)),
        "receive_sos": bool(getattr(lnk, "receive_sos", True)),
        "receive_no_volunteer": bool(getattr(lnk, "receive_no_volunteer", True)),
        "receive_volunteer_accepted": bool(getattr(lnk, "receive_volunteer_accepted", True)),
        "receive_help_completed": bool(getattr(lnk, "receive_help_completed", True)),
        "receive_place_arrival": bool(getattr(lnk, "receive_place_arrival", True)),
        "arrival_departure_only": bool(
            lnk.share_arrival_departure
            and not lnk.share_help_requests
            and not lnk.share_unusual_route
            and not lnk.share_live_map
        ),
        "created_at": _iso_utc(lnk.created_at),
        "confirmed_at": _iso_utc(lnk.confirmed_at),
    }


@router.get("/sharing")
def get_my_sharing_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    session = _ensure_share_session(db, current_user)
    _refresh_timed_pause(db, session)
    return _serialize_share_session(session)


@router.post("/sharing/consent")
async def update_sharing_consent(
    data: FamilyConsentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    session = _ensure_share_session(db, current_user)

    if data.is_sharing and not data.consent_given:
        raise HTTPException(
            status_code=400,
            detail="Explicit consent is required before enabling family live location sharing.",
        )

    now = datetime.now(timezone.utc)
    session.consent_given = data.consent_given
    session.is_sharing = data.is_sharing and data.consent_given
    session.is_paused = data.is_paused if session.is_sharing else False

    if session.is_paused and data.pause_minutes:
        session.paused_until = now + timedelta(minutes=data.pause_minutes)
    elif not session.is_paused:
        session.paused_until = None

    if data.quiet_hours_enabled is not None:
        session.quiet_hours_enabled = data.quiet_hours_enabled
    if data.quiet_hours_start is not None:
        session.quiet_hours_start = data.quiet_hours_start
    if data.quiet_hours_end is not None:
        session.quiet_hours_end = data.quiet_hours_end
    if data.quiet_hours_tz_offset_min is not None:
        session.quiet_hours_tz_offset_min = data.quiet_hours_tz_offset_min
    if data.caregiver_managed is not None:
        session.caregiver_managed = data.caregiver_managed
    if data.caregiver_name is not None:
        session.caregiver_name = data.caregiver_name.strip() or None

    if data.regenerate_code:
        session.invite_code = f"SL-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"
    session.updated_at = now
    db.commit()
    db.refresh(session)

    await notify_family_event(
        db,
        current_user.id,
        event_type="SHARING_STATUS_CHANGED",
        title="Location Sharing Updated",
        body=(
            f"{current_user.full_name} paused updates{' for ' + str(data.pause_minutes) + ' min' if data.pause_minutes else ''}."
            if session.is_paused
            else f"{current_user.full_name} enabled calm family updates."
            if session.is_sharing
            else f"{current_user.full_name} stopped family updates."
        ),
        extra=_serialize_share_session(session),
    )

    return _serialize_share_session(session)


@router.put("/sharing/safe-zone")
def save_safe_zone(
    data: SafeZoneUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    session = _ensure_share_session(db, current_user)
    session.safe_zone_name = data.safe_zone_name.strip()
    session.safe_zone_lat = data.safe_zone_lat
    session.safe_zone_lng = data.safe_zone_lng
    session.safe_zone_radius_m = data.safe_zone_radius_m

    last_coords = get_session_last_coords(session)
    if last_coords:
        dist_m = haversine_distance_km(
            last_coords[0], last_coords[1],
            data.safe_zone_lat, data.safe_zone_lng,
        ) * 1000.0
        session.was_inside_safe_zone = dist_m <= data.safe_zone_radius_m
    else:
        session.was_inside_safe_zone = True

    session.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    return _serialize_share_session(session)


# ── Saved Places (Home, Clinic, Work, Market, custom) ─────────────────────────
@router.get("/saved-places")
def list_saved_places(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    places = (
        db.query(SavedPlace)
        .filter(SavedPlace.user_id == current_user.id)
        .order_by(SavedPlace.created_at.asc())
        .all()
    )
    return [_serialize_saved_place(p) for p in places]


@router.post("/saved-places")
def upsert_saved_place(
    data: SavedPlaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    clean_name = data.name.strip()
    existing = (
        db.query(SavedPlace)
        .filter(SavedPlace.user_id == current_user.id, SavedPlace.name == clean_name)
        .first()
    )
    enc = encrypt_coords(data.latitude, data.longitude)
    if existing:
        existing.category = data.category.strip().lower() or "custom"
        existing.encrypted_coords = enc
        existing.radius_m = data.radius_m
        db.commit()
        db.refresh(existing)
        return _serialize_saved_place(existing)

    place = SavedPlace(
        user_id=current_user.id,
        name=clean_name,
        category=data.category.strip().lower() or "custom",
        encrypted_coords=enc,
        radius_m=data.radius_m,
        is_currently_inside=False,
    )
    db.add(place)
    db.commit()
    db.refresh(place)
    return _serialize_saved_place(place)


@router.delete("/saved-places/{place_id}")
def delete_saved_place(
    place_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    place = (
        db.query(SavedPlace)
        .filter(SavedPlace.id == place_id, SavedPlace.user_id == current_user.id)
        .first()
    )
    if not place:
        raise HTTPException(status_code=404, detail="Saved place not found")
    db.delete(place)
    db.commit()
    return {"status": "deleted", "id": place_id}


# ── Encrypted Telemetry + Calm Family Event Engine ─────────────────────────────
@router.post("/location")
async def update_family_telemetry(
    data: FamilyTelemetryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    session = _ensure_share_session(db, current_user)
    _refresh_timed_pause(db, session)

    if not session.consent_given or not session.is_sharing or session.is_paused:
        return {
            "recorded": False,
            "is_sharing": session.is_sharing,
            "is_paused": session.is_paused,
            "message": "Location sharing is currently paused or inactive.",
        }

    now = datetime.now(timezone.utc)
    inside_zone = True
    geofence_breached = False

    if session.safe_zone_lat is not None and session.safe_zone_lng is not None:
        dist_m = haversine_distance_km(
            data.latitude, data.longitude,
            session.safe_zone_lat, session.safe_zone_lng,
        ) * 1000.0
        inside_zone = dist_m <= (session.safe_zone_radius_m or 250.0)
        if session.was_inside_safe_zone and not inside_zone:
            geofence_breached = True
            session.last_geofence_alert_at = now
        session.was_inside_safe_zone = inside_zone

    # Store encrypted coordinates at rest; keep plaintext floats nulled/sentinel
    session.encrypted_last_coords = encrypt_coords(data.latitude, data.longitude)
    session.last_latitude = None
    session.last_longitude = None
    if data.battery_level is not None:
        session.battery_level = data.battery_level
    session.last_seen_at = now
    session.updated_at = now

    crumb = LocationBreadcrumb(
        user_id=current_user.id,
        latitude=0.0,
        longitude=0.0,
        encrypted_coords=encrypt_coords(data.latitude, data.longitude),
        accuracy=data.accuracy,
        battery_level=data.battery_level,
        inside_safe_zone=inside_zone,
        recorded_at=now,
    )
    db.add(crumb)
    db.commit()

    await process_calm_location_events(
        db,
        current_user,
        session,
        data.latitude,
        data.longitude,
        now,
        fall_detected=data.fall_detected,
    )

    await notify_family_event(
        db,
        current_user.id,
        event_type="FAMILY_TELEMETRY_UPDATE",
        title="Live Location Updated",
        body=f"{current_user.full_name} updated location",
        extra={
            "battery_level": session.battery_level,
            "last_seen_at": now.isoformat(),
            "last_place_name": session.last_place_name,
            "inside_safe_zone": inside_zone,
        },
    )

    if geofence_breached:
        await notify_family_event(
            db,
            current_user.id,
            event_type="GEOFENCE_EXIT_ALERT",
            title="Safe Zone Alert",
            body=f"{current_user.full_name} left saved safe zone '{session.safe_zone_name or 'Safe Zone'}'.",
            extra={
                "safe_zone_name": session.safe_zone_name,
            },
        )

    return {
        "recorded": True,
        "inside_safe_zone": inside_zone,
        "geofence_breached": geofence_breached,
        "last_seen_at": now.isoformat(),
        "last_place_name": session.last_place_name,
    }


@router.delete("/location-history")
async def delete_my_location_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    """One-tap permanent deletion of raw GPS history and learned corridors while keeping calm event summaries."""
    crumbs_deleted = (
        db.query(LocationBreadcrumb)
        .filter(LocationBreadcrumb.user_id == current_user.id)
        .delete(synchronize_session=False)
    )
    routes_deleted = (
        db.query(UsualRoutePoint)
        .filter(UsualRoutePoint.user_id == current_user.id)
        .delete(synchronize_session=False)
    )
    session = db.query(FamilyShareSession).filter(
        FamilyShareSession.blind_user_id == current_user.id
    ).first()
    if session:
        session.last_latitude = None
        session.last_longitude = None
        session.encrypted_last_coords = None
        session.stopped_anchor_enc = None
        session.stopped_anchor_since = None
        session.long_stop_alerted = False
        session.updated_at = datetime.now(timezone.utc)
    db.commit()

    await emit_calm_family_event(
        db,
        current_user.id,
        event_type="LOCATION_HISTORY_CLEARED",
        category="system",
        title="Location History Deleted",
        summary="Raw GPS location history was deleted cleanly by user request",
        urgent=False,
    )

    return {
        "status": "deleted",
        "breadcrumbs_deleted": crumbs_deleted or 0,
        "route_points_deleted": routes_deleted or 0,
        "message": "Your raw location history has been permanently deleted.",
    }


# ── Per-Family-Member Controls & Invite Confirmation ─────────────────────────
@router.get("/members")
def list_family_members_for_user(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    links = (
        db.query(FamilyLink)
        .filter(FamilyLink.blind_user_id == current_user.id)
        .order_by(FamilyLink.created_at.desc())
        .all()
    )
    return [_serialize_member_link(db, lnk) for lnk in links]


@router.post("/members/confirm-latest")
async def confirm_latest_pending_family_invite(
    data: FamilyMemberConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    lnk = (
        db.query(FamilyLink)
        .filter(FamilyLink.blind_user_id == current_user.id, FamilyLink.status == "pending_confirmation")
        .order_by(FamilyLink.created_at.desc())
        .first()
    )
    if not lnk:
        raise HTTPException(status_code=404, detail="No pending family member invite waiting for confirmation.")
    return await confirm_or_decline_family_member(lnk.id, data, db=db, current_user=current_user)


@router.post("/members/{link_id}/confirm")
async def confirm_or_decline_family_member(
    link_id: str,
    data: FamilyMemberConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    lnk = (
        db.query(FamilyLink)
        .filter(FamilyLink.id == link_id, FamilyLink.blind_user_id == current_user.id)
        .first()
    )
    if not lnk:
        raise HTTPException(status_code=404, detail="Family invite link request not found")

    lnk.status = "approved" if data.approved else "declined"
    if data.approved:
        lnk.confirmed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(lnk)

    await notification_hub.send_to_user(
        lnk.family_user_id,
        {
            "type": "FAMILY_INVITE_CONFIRMED" if data.approved else "FAMILY_INVITE_DECLINED",
            "invite_code": lnk.invite_code,
            "status": lnk.status,
            "message": f"{current_user.full_name} {'confirmed' if data.approved else 'declined'} your family connection.",
        },
    )
    return _serialize_member_link(db, lnk)


@router.put("/members/{link_id}/permissions")
def update_member_permissions(
    link_id: str,
    data: FamilyMemberPermissionsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    lnk = (
        db.query(FamilyLink)
        .filter(FamilyLink.id == link_id, FamilyLink.blind_user_id == current_user.id)
        .first()
    )
    if not lnk:
        raise HTTPException(status_code=404, detail="Family member link not found")

    if data.arrival_departure_only is True:
        lnk.share_arrival_departure = True
        lnk.share_help_requests = False
        lnk.share_unusual_route = False
        lnk.share_live_map = False
    else:
        if data.share_arrival_departure is not None:
            lnk.share_arrival_departure = data.share_arrival_departure
        if data.share_help_requests is not None:
            lnk.share_help_requests = data.share_help_requests
        if data.share_unusual_route is not None:
            lnk.share_unusual_route = data.share_unusual_route
        if data.share_live_map is not None:
            lnk.share_live_map = data.share_live_map

    if data.relationship_label is not None:
        lnk.relationship_label = data.relationship_label.strip() or lnk.relationship_label

    for field in (
        "notify_email",
        "notify_telegram",
        "notify_web_push",
        "receive_sos",
        "receive_no_volunteer",
        "receive_volunteer_accepted",
        "receive_help_completed",
        "receive_place_arrival",
    ):
        val = getattr(data, field, None)
        if val is not None:
            setattr(lnk, field, val)

    db.commit()
    db.refresh(lnk)
    return _serialize_member_link(db, lnk)


@router.delete("/members/{link_id}")
def remove_family_member(
    link_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    lnk = (
        db.query(FamilyLink)
        .filter(FamilyLink.id == link_id, FamilyLink.blind_user_id == current_user.id)
        .first()
    )
    if not lnk:
        raise HTTPException(status_code=404, detail="Family member link not found")
    db.delete(lnk)
    db.commit()
    return {"status": "removed", "link_id": link_id}


@router.put("/my-links/{link_id}/preferences")
def update_my_family_notification_preferences(
    link_id: str,
    data: FamilyMemberChannelPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.FAMILY)),
):
    lnk = (
        db.query(FamilyLink)
        .filter(FamilyLink.id == link_id, FamilyLink.family_user_id == current_user.id)
        .first()
    )
    if not lnk:
        raise HTTPException(status_code=404, detail="Family link not found")
    for field in (
        "notify_email",
        "notify_telegram",
        "notify_web_push",
        "receive_sos",
        "receive_no_volunteer",
        "receive_volunteer_accepted",
        "receive_help_completed",
        "receive_place_arrival",
    ):
        val = getattr(data, field, None)
        if val is not None:
            setattr(lnk, field, val)
    db.commit()
    db.refresh(lnk)
    return _serialize_member_link(db, lnk)


@router.get("/notifications/logs")
def get_notification_delivery_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.BLIND_USER:
        rows = (
            db.query(NotificationDeliveryLog)
            .filter(NotificationDeliveryLog.blind_user_id == current_user.id)
            .order_by(NotificationDeliveryLog.created_at.desc())
            .limit(40)
            .all()
        )
    elif current_user.role == UserRole.FAMILY:
        rows = (
            db.query(NotificationDeliveryLog)
            .filter(NotificationDeliveryLog.recipient_user_id == current_user.id)
            .order_by(NotificationDeliveryLog.created_at.desc())
            .limit(40)
            .all()
        )
    else:
        return []

    return [
        {
            "id": r.id,
            "event_type": r.event_type,
            "channel": r.channel,
            "destination_masked": r.destination_masked,
            "status": r.status,
            "attempt_count": r.attempt_count,
            "error_detail": r.error_detail,
            "recipient_scope": "self" if r.recipient_user_id == r.blind_user_id else "family",
            "created_at": _iso_utc(r.created_at),
        }
        for r in rows
    ]


# ── Read-Only Family Tracking & Calm Timeline ─────────────────────────────────
def _build_family_snapshot(db: Session, session: FamilyShareSession, viewer_user: Optional[User]) -> dict:
    _refresh_timed_pause(db, session)
    blind_user = session.blind_user or db.query(User).filter(User.id == session.blind_user_id).first()

    viewer_link = None
    if viewer_user and viewer_user.role == UserRole.FAMILY:
        viewer_link = (
            db.query(FamilyLink)
            .filter(
                FamilyLink.family_user_id == viewer_user.id,
                FamilyLink.blind_user_id == session.blind_user_id,
            )
            .first()
        )
        if viewer_link:
            if viewer_link.status == "declined":
                raise HTTPException(status_code=403, detail="Access declined by user.")
            if viewer_link.status == "pending_confirmation":
                return {
                    "invite_code": session.invite_code,
                    "user_name": blind_user.full_name if blind_user else "SightLink User",
                    "sharing_status": "pending_confirmation",
                    "awaiting_user_confirmation": True,
                    "is_sharing": False,
                    "is_paused": False,
                    "read_only": True,
                    "live_map_allowed": False,
                    "sos_active": session.sos_active,
                    "message": "Invite accepted — waiting for user confirmation by voice or button.",
                    "timeline": [],
                    "trail": [],
                    "active_request": None,
                }

    active_sos = (
        db.query(SOSAlert)
        .filter(SOSAlert.user_id == session.blind_user_id, SOSAlert.active == True)
        .order_by(SOSAlert.created_at.desc())
        .first()
    )

    events_rows = (
        db.query(FamilyEvent)
        .filter(FamilyEvent.blind_user_id == session.blind_user_id)
        .order_by(FamilyEvent.updated_at.desc())
        .limit(40)
        .all()
    )
    filtered_events = []
    for ev in events_rows:
        if viewer_link:
            if not ev.urgent:
                if ev.category == "arrival_departure" and not viewer_link.share_arrival_departure:
                    continue
                if ev.category == "help_request" and not viewer_link.share_help_requests:
                    continue
                if ev.category in ("unusual_route", "long_stop") and not viewer_link.share_unusual_route:
                    continue
        filtered_events.append(serialize_family_event(ev))

    active_req = (
        db.query(AssistanceRequest)
        .filter(
            AssistanceRequest.blind_user_id == session.blind_user_id,
            AssistanceRequest.status.in_([RequestStatus.PENDING, RequestStatus.ACCEPTED, RequestStatus.ARRIVED]),
        )
        .order_by(AssistanceRequest.created_at.desc())
        .first()
    )
    active_live = (
        db.query(LiveAssistSession)
        .filter(
            LiveAssistSession.blind_user_id == session.blind_user_id,
            LiveAssistSession.status.in_([LiveAssistStatus.WAITING, LiveAssistStatus.CONNECTED]),
        )
        .order_by(LiveAssistSession.created_at.desc())
        .first()
    )

    show_help_status = True if not viewer_link else bool(viewer_link.share_help_requests or session.sos_active)
    help_status = {
        "has_active_help": bool((active_req or active_live) and show_help_status),
        "mode": "in_person" if active_req else "live_video" if active_live else "none",
        "label": (
            f"Active in-person help ({active_req.status.value})"
            if (active_req and show_help_status)
            else f"Active Eyes on Demand check ({active_live.status.value})"
            if (active_live and show_help_status)
            else "All calm — no active help request"
        ),
        "volunteer_first_name": (
            active_req.accepted_volunteer.full_name.split()[0]
            if (active_req and active_req.accepted_volunteer and show_help_status)
            else active_live.accepted_volunteer.full_name.split()[0]
            if (active_live and active_live.accepted_volunteer and show_help_status)
            else None
        ),
    }

    if not session.consent_given or not session.is_sharing:
        return {
            "invite_code": session.invite_code,
            "user_name": blind_user.full_name if blind_user else "SightLink User",
            "sharing_status": "stopped",
            "is_sharing": False,
            "is_paused": False,
            "read_only": True,
            "live_map_allowed": False,
            "caregiver_managed": bool(session.caregiver_managed),
            "caregiver_name": session.caregiver_name,
            "last_place_name": session.last_place_name or "Sharing stopped",
            "last_seen_at": _iso_utc(session.last_seen_at),
            "sos_active": bool(session.sos_active or active_sos),
            "sos_alert": {
                "id": active_sos.id,
                "latitude": active_sos.latitude,
                "longitude": active_sos.longitude,
                "triggered_at": _iso_utc(active_sos.created_at),
                "notes": active_sos.notes,
            } if active_sos else None,
            "message": "Location sharing is currently turned off by the user.",
            "timeline": filtered_events,
            "help_status": help_status,
            "trail": [],
            "active_request": None,
        }

    live_map_allowed = True if not viewer_link else bool(viewer_link.share_live_map)
    current_coords = get_session_last_coords(session) if (not session.is_paused and live_map_allowed) else None

    trail_items = []
    if not session.is_paused and live_map_allowed:
        crumbs = (
            db.query(LocationBreadcrumb)
            .filter(LocationBreadcrumb.user_id == session.blind_user_id)
            .order_by(LocationBreadcrumb.recorded_at.desc())
            .limit(40)
            .all()
        )
        for c in reversed(crumbs):
            coords = get_breadcrumb_coords(c)
            if coords:
                trail_items.append({
                    "latitude": coords[0],
                    "longitude": coords[1],
                    "battery_level": c.battery_level,
                    "inside_safe_zone": c.inside_safe_zone,
                    "recorded_at": _iso_utc(c.recorded_at),
                })

    paused_until_utc = _as_utc(session.paused_until)
    now = datetime.now(timezone.utc)
    paused_min_left = (
        max(1, int((paused_until_utc - now).total_seconds() // 60) + 1)
        if session.is_paused and paused_until_utc and paused_until_utc > now
        else None
    )

    return {
        "invite_code": session.invite_code,
        "user_name": blind_user.full_name if blind_user else "SightLink User",
        "sharing_status": "paused" if session.is_paused else "live",
        "is_sharing": True,
        "is_paused": session.is_paused,
        "paused_until": paused_until_utc.isoformat() if paused_until_utc else None,
        "paused_minutes_remaining": paused_min_left,
        "read_only": True,
        "live_map_allowed": live_map_allowed,
        "permissions": {
            "arrival_departure": bool(viewer_link.share_arrival_departure) if viewer_link else True,
            "help_requests": bool(viewer_link.share_help_requests) if viewer_link else True,
            "unusual_route": bool(viewer_link.share_unusual_route) if viewer_link else True,
            "live_map": live_map_allowed,
        },
        "caregiver_managed": bool(session.caregiver_managed),
        "caregiver_name": session.caregiver_name,
        "quiet_hours_enabled": bool(session.quiet_hours_enabled),
        "last_place_name": session.last_place_name or (
            session.safe_zone_name if session.safe_zone_lat is not None and session.was_inside_safe_zone else "Waiting for update"
        ),
        "current_location": {
            "latitude": current_coords[0],
            "longitude": current_coords[1],
        } if current_coords else None,
        "last_seen_at": _iso_utc(session.last_seen_at),
        "battery_level": session.battery_level,
        "safe_zone": {
            "name": session.safe_zone_name,
            "lat": session.safe_zone_lat,
            "lng": session.safe_zone_lng,
            "radius_m": session.safe_zone_radius_m,
            "inside": session.was_inside_safe_zone,
        } if (session.safe_zone_lat is not None and live_map_allowed) else None,
        "trail": trail_items,
        "timeline": filtered_events,
        "help_status": help_status,
        "active_request": (
            build_assistance_response(active_req, fuzz_location=False).model_dump()
            if (active_req and show_help_status)
            else None
        ),
        "sos_active": bool(session.sos_active or active_sos),
        "sos_alert": {
            "id": active_sos.id,
            "latitude": active_sos.latitude,
            "longitude": active_sos.longitude,
            "triggered_at": _iso_utc(active_sos.created_at),
            "notes": active_sos.notes,
        } if active_sos else None,
    }


@router.get("/track/{invite_code}")
def track_by_invite_code(
    invite_code: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """Read-only calm family updates + optional gated live tracking endpoint."""
    code = invite_code.strip().upper()
    session = db.query(FamilyShareSession).filter(FamilyShareSession.invite_code == code).first()
    if not session:
        raise HTTPException(status_code=404, detail="Invalid or expired family invite code.")
    return _build_family_snapshot(db, session, current_user)


@router.get("/timeline/{invite_code}")
def get_calm_timeline_by_code(
    invite_code: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    code = invite_code.strip().upper()
    session = db.query(FamilyShareSession).filter(FamilyShareSession.invite_code == code).first()
    if not session:
        raise HTTPException(status_code=404, detail="Invalid or expired family invite code.")
    snap = _build_family_snapshot(db, session, current_user)
    return {
        "invite_code": snap["invite_code"],
        "user_name": snap["user_name"],
        "last_place_name": snap.get("last_place_name"),
        "last_seen_at": snap.get("last_seen_at"),
        "help_status": snap.get("help_status"),
        "timeline": snap.get("timeline", []),
        "live_map_allowed": snap.get("live_map_allowed", False),
    }


@router.get("/my/timeline")
def get_my_family_events_timeline(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    rows = (
        db.query(FamilyEvent)
        .filter(FamilyEvent.blind_user_id == current_user.id)
        .order_by(FamilyEvent.updated_at.desc())
        .limit(40)
        .all()
    )
    return [serialize_family_event(ev) for ev in rows]


@router.post("/link")
async def link_family_to_user(
    data: FamilyLinkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.FAMILY)),
):
    code = data.invite_code.strip().upper()
    session = db.query(FamilyShareSession).filter(FamilyShareSession.invite_code == code).first()
    if not session:
        raise HTTPException(status_code=404, detail="Invite code not found.")

    initial_status = "pending_confirmation"

    existing = db.query(FamilyLink).filter(
        FamilyLink.family_user_id == current_user.id,
        FamilyLink.blind_user_id == session.blind_user_id,
    ).first()
    if not existing:
        existing = FamilyLink(
            family_user_id=current_user.id,
            blind_user_id=session.blind_user_id,
            invite_code=code,
            relationship_label=data.relationship_label,
            status=initial_status,
            share_arrival_departure=True,
            share_help_requests=True,
            share_unusual_route=True,
            share_live_map=False,
        )
        db.add(existing)
    else:
        existing.invite_code = code
        existing.relationship_label = data.relationship_label
        if existing.status == "declined":
            existing.status = "pending_confirmation"
    db.commit()
    db.refresh(existing)

    await notification_hub.send_to_user(
        session.blind_user_id,
        {
            "type": "FAMILY_INVITE_PENDING_CONFIRMATION",
            "link_id": existing.id,
            "family_name": current_user.full_name,
            "relationship_label": existing.relationship_label,
            "voice_announcement": f"{current_user.full_name} accepted your family invite. Say confirm family member to approve.",
        },
    )

    return {
        "status": existing.status,
        "link_id": existing.id,
        "invite_code": code,
        "blind_user_id": session.blind_user_id,
        "awaiting_user_confirmation": existing.status == "pending_confirmation",
        "message": (
            "Invite accepted! Waiting for the user to confirm by voice or button."
            if existing.status == "pending_confirmation"
            else "Family link active."
        ),
    }


@router.get("/linked")
def list_linked_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.FAMILY)),
):
    links = db.query(FamilyLink).filter(FamilyLink.family_user_id == current_user.id).all()
    results = []
    for lnk in links:
        blind = db.query(User).filter(User.id == lnk.blind_user_id).first()
        session = db.query(FamilyShareSession).filter(FamilyShareSession.blind_user_id == lnk.blind_user_id).first()
        if session:
            results.append({
                "link_id": lnk.id,
                "status": lnk.status or "approved",
                "invite_code": session.invite_code,
                "user_name": blind.full_name if blind else "SightLink User",
                "relationship": lnk.relationship_label,
                "is_sharing": session.is_sharing if lnk.status == "approved" else False,
                "is_paused": session.is_paused,
                "sos_active": session.sos_active,
                "last_place_name": session.last_place_name if lnk.status == "approved" else None,
                "last_seen_at": _iso_utc(session.last_seen_at),
                "share_live_map": bool(lnk.share_live_map),
                "notify_email": bool(getattr(lnk, "notify_email", True)),
                "notify_telegram": bool(getattr(lnk, "notify_telegram", True)),
                "notify_web_push": bool(getattr(lnk, "notify_web_push", True)),
                "receive_sos": bool(getattr(lnk, "receive_sos", True)),
                "receive_no_volunteer": bool(getattr(lnk, "receive_no_volunteer", True)),
                "receive_volunteer_accepted": bool(getattr(lnk, "receive_volunteer_accepted", True)),
                "receive_help_completed": bool(getattr(lnk, "receive_help_completed", True)),
                "receive_place_arrival": bool(getattr(lnk, "receive_place_arrival", True)),
            })
    return results


@router.post("/check-in-alert")
async def send_family_check_in_alert(
    data: FamilyCheckInAlertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    """Send an immediate family check-in / live location alert through the existing notification service."""
    session = _ensure_share_session(db, current_user)
    now = datetime.now(timezone.utc)

    lat = data.latitude
    lng = data.longitude
    if lat is None or lng is None:
        last_coords = get_session_last_coords(session)
        if last_coords:
            lat, lng = last_coords
    elif session.consent_given and session.is_sharing and not session.is_paused:
        session.encrypted_last_coords = encrypt_coords(lat, lng)
        session.last_latitude = None
        session.last_longitude = None
        session.last_seen_at = now
        session.updated_at = now
        db.commit()

    is_call = data.action_type == "call_family"
    first = current_user.full_name.strip().split()[0] if current_user.full_name else "User"
    maps_url = f"https://maps.google.com/?q={lat:.6f},{lng:.6f}" if (lat is not None and lng is not None) else None
    body = (
        f"{current_user.full_name} asked to speak with family right now."
        if is_call
        else f"{first} shared their live location with family."
    )
    if data.note:
        body = f"{body} ({data.note})"

    ev = await notify_family_event(
        db,
        current_user.id,
        event_type="FAMILY_CHECK_IN",
        title="Family Call Request" if is_call else "Live Location Shared",
        body=body,
        extra={
            "action_type": data.action_type,
            "latitude": lat,
            "longitude": lng,
            "maps_url": maps_url,
            "urgent": is_call,
            "alert_id": f"checkin-{int(now.timestamp())}",
        },
    )
    deliveries = getattr(ev, "_channel_deliveries", []) if ev else []
    sent_channels = [d["channel"] for d in deliveries if d.get("status") == "sent"]
    encoded = quote_plus(f"{body}{' Location: ' + maps_url if maps_url else ''}")
    return {
        "status": "sent",
        "action_type": data.action_type,
        "latitude": lat,
        "longitude": lng,
        "google_maps_url": maps_url,
        "sent_channels": sent_channels,
        "sms_fallback_url": f"sms:?body={encoded}",
        "whatsapp_fallback_url": f"https://wa.me/?text={encoded}",
        "message": (
            f"Family notified via {', '.join(sent_channels)}."
            if sent_channels
            else "Family check-in recorded in timeline; use SMS or WhatsApp fallback if needed."
        ),
    }


@router.post("/navigation-event")
async def emit_navigation_family_event(
    data: FamilyNavigationEventRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    """Share walking navigation start/arrival milestones in the family event timeline based on consent settings."""
    session = _ensure_share_session(db, current_user)
    _refresh_timed_pause(db, session)

    if not session.consent_given or not session.is_sharing or session.is_paused:
        return {
            "recorded": False,
            "shared": False,
            "reason": "Family sharing is disabled or paused by user consent settings.",
        }

    first = current_user.full_name.strip().split()[0] if current_user.full_name else "User"
    dest = data.destination_name.strip()
    if data.status == "started":
        ev_type = "NAVIGATION_STARTED"
        title = f"Walking to {dest}"
        summary = f"{first} started voice walking navigation toward {dest}"
        if data.distance_m:
            summary += f" ({data.distance_m} m)."
    elif data.status == "arrived":
        ev_type = "NAVIGATION_ARRIVED"
        title = f"Arrived at {dest}"
        summary = f"{first} arrived safely at {dest}."
        session.last_place_name = dest
        db.commit()
    elif data.status == "rerouted":
        ev_type = "NAVIGATION_REROUTED"
        title = f"Rerouting toward {dest}"
        summary = f"{first} adjusted walking route toward {dest}."
    else:
        ev_type = "NAVIGATION_CANCELLED"
        title = "Navigation Stopped"
        summary = f"{first} ended walking navigation before reaching {dest}."

    ev = await emit_calm_family_event(
        db,
        current_user.id,
        event_type=ev_type,
        category="arrival_departure",
        title=title,
        summary=summary,
        place_name=dest,
        urgent=False,
        metadata={
            "status": data.status,
            "distance_m": data.distance_m,
            "eta_minutes": data.eta_minutes,
        },
    )
    return {
        "recorded": True,
        "shared": True,
        "event_id": ev.id if ev else None,
        "event_type": ev_type,
        "summary": summary,
    }
