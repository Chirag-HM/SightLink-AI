from typing import Optional
from sqlalchemy.orm import Session

from .models import (
    AssistanceRequest, FamilyShareSession, FamilyLink, PushSubscription, User
)
from .schemas import AssistanceRequestResponse, VolunteerPublicInfo
from .geospatial import (
    haversine_distance_km, calculate_approx_distance_text,
    estimate_walking_eta_minutes, fuzz_coordinates_for_privacy
)
from .websockets import notification_hub
from .fcm import fcm_service


async def notify_family_event(
    db: Session,
    blind_user_id: str,
    event_type: str,
    title: str,
    body: str,
    extra: Optional[dict] = None
):
    """Send live WebSocket & Web Push notifications AND log calm family timeline summaries when appropriate."""
    from .family_events import emit_calm_family_event

    session = db.query(FamilyShareSession).filter(
        FamilyShareSession.blind_user_id == blind_user_id
    ).first()

    # Map high-signal events into persistent Calm Family Timeline entries (never telemetry spam)
    blind_user = db.query(User).filter(User.id == blind_user_id).first()
    first = blind_user.full_name.strip().split()[0] if (blind_user and blind_user.full_name) else "User"
    calm_map = {
        "HELP_REQUEST_STARTED": ("help_request", "Help Requested", f"{first} asked for help", False),
        "HELP_REQUEST_ACCEPTED": (
            "help_request",
            "Volunteer With Them",
            f"{first} asked for help and {((extra or {}).get('volunteer_name') or 'a volunteer').split()[0]} is on the way",
            False,
        ),
        "HELP_REQUEST_ARRIVED": ("help_request", "Volunteer Arrived", body, False),
        "HELP_REQUEST_COMPLETED": ("help_request", "Help Session Finished", "Help session finished safely", False),
        "HELP_REQUEST_CANCELLED": ("help_request", "Help Cancelled", body, False),
        "HELP_REQUEST_ESCALATED_SOS": (
            "sos",
            "No Volunteer Available Nearby",
            f"No volunteer available nearby. {first} may need help.",
            True,
        ),
        "NO_VOLUNTEER_AVAILABLE": (
            "sos",
            "No Volunteer Available Nearby",
            f"No volunteer available nearby. {first} may need help.",
            True,
        ),
        "GEOFENCE_EXIT_ALERT": ("arrival_departure", title, f"{first} left {(extra or {}).get('safe_zone_name') or 'Home Safe Zone'}", False),
        "SOS_TRIGGERED": ("sos", "EMERGENCY SOS ALERT", f"{blind_user.full_name if blind_user else first} triggered an emergency SOS alert!", True),
        "SOS_RESOLVED": ("sos", "SOS Resolved", f"{first} marked the emergency SOS as safe/resolved.", False),
        "FAMILY_CHECK_IN": (
            "help_request",
            title or "Family Check-In & Live Location",
            body or f"{first} asked to contact family and shared their live location.",
            True,
        ),
    }

    if event_type in calm_map:
        cat, calm_title, calm_summary, urgent = calm_map[event_type]
        return await emit_calm_family_event(
            db,
            blind_user_id,
            event_type=event_type,
            category=cat,
            title=calm_title,
            summary=calm_summary,
            place_name=(extra or {}).get("safe_zone_name"),
            urgent=urgent,
            metadata=extra,
        )

    payload = {
        "type": event_type,
        "title": title,
        "body": body,
        "blind_user_id": blind_user_id,
        **(extra or {})
    }

    if session and session.invite_code:
        payload["invite_code"] = session.invite_code
        await notification_hub.send_to_family_watchers(session.invite_code, payload)

    # Also notify linked approved family user accounts directly
    links = db.query(FamilyLink).filter(
        FamilyLink.blind_user_id == blind_user_id,
        FamilyLink.status == "approved",
    ).all()
    linked_user_ids = [lnk.family_user_id for lnk in links]
    for f_uid in linked_user_ids:
        await notification_hub.send_to_user(f_uid, payload)

    if event_type == "FAMILY_TELEMETRY_UPDATE":
        return

    # Dispatch VAPID Web Push to registered family subscriptions (if VAPID keys configured)
    subs_query = db.query(PushSubscription)
    if session and session.invite_code and linked_user_ids:
        subs = subs_query.filter(
            (PushSubscription.invite_code == session.invite_code)
            | (PushSubscription.user_id.in_(linked_user_ids))
        ).all()
    elif session and session.invite_code:
        subs = subs_query.filter(PushSubscription.invite_code == session.invite_code).all()
    elif linked_user_ids:
        subs = subs_query.filter(PushSubscription.user_id.in_(linked_user_ids)).all()
    else:
        subs = []

    for sub in subs:
        if sub.p256dh and sub.auth:
            fcm_service.send_web_push(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth}
                },
                payload={
                    "title": title,
                    "body": body,
                    "tag": event_type,
                    "data": {
                        "url": f"/family/track/{session.invite_code}" if session else "/family/track",
                        **payload
                    }
                }
            )


def build_assistance_response(
    req: AssistanceRequest,
    *,
    fuzz_location: bool = False,
    viewer_lat: Optional[float] = None,
    viewer_lng: Optional[float] = None
) -> AssistanceRequestResponse:
    lat, lng = req.latitude, req.longitude
    if fuzz_location:
        lat, lng = fuzz_coordinates_for_privacy(req.latitude, req.longitude)

    vol_info = None
    dist_km = None
    dist_text = None
    eta_minutes = None

    if req.accepted_volunteer:
        v_prof = req.accepted_volunteer.volunteer_profile
        v_lat = v_prof.last_latitude if v_prof else None
        v_lng = v_prof.last_longitude if v_prof else None
        if v_lat is not None and v_lng is not None:
            dist_km = haversine_distance_km(req.latitude, req.longitude, v_lat, v_lng)
            dist_text = calculate_approx_distance_text(dist_km)
            eta_minutes = estimate_walking_eta_minutes(dist_km)

        vol_info = VolunteerPublicInfo(
            id=req.accepted_volunteer.id,
            full_name=req.accepted_volunteer.full_name,
            phone_number=req.accepted_volunteer.phone_number,
            is_verified=bool(
                req.accepted_volunteer.is_verified or (v_prof and v_prof.is_verified)
            ),
            avg_rating=round(v_prof.avg_rating, 2) if v_prof else 5.0,
            rating_count=v_prof.rating_count if v_prof else 0,
            latitude=v_lat if (v_prof and v_prof.is_available and v_prof.share_location_consent) else None,
            longitude=v_lng if (v_prof and v_prof.is_available and v_prof.share_location_consent) else None,
            eta_minutes=eta_minutes,
            approx_distance_km=dist_km,
            approx_distance_text=dist_text,
        )
    elif viewer_lat is not None and viewer_lng is not None:
        dist_km = haversine_distance_km(req.latitude, req.longitude, viewer_lat, viewer_lng)
        dist_text = calculate_approx_distance_text(dist_km)
        eta_minutes = estimate_walking_eta_minutes(dist_km)

    return AssistanceRequestResponse(
        id=req.id,
        userId=req.blind_user_id,
        blind_user_id=req.blind_user_id,
        blind_user_name=req.blind_user.full_name if req.blind_user else "Blind User",
        status=req.status,
        type=req.assistance_type,
        assistance_type=req.assistance_type,
        notes=req.notes,
        radius_km=req.radius_km,
        escalation_stage=req.escalation_stage or 0,
        createdAt=req.created_at,
        created_at=req.created_at,
        accepted_at=req.accepted_at,
        arrived_at=req.arrived_at,
        completed_at=req.completed_at,
        cancelled_at=req.cancelled_at,
        rating=req.rating,
        rating_comment=req.rating_comment,
        accepted_volunteer=vol_info,
        lat=lat,
        lng=lng,
        latitude=lat,
        longitude=lng,
        approx_distance_km=dist_km,
        approx_distance_text=dist_text,
        eta_minutes=eta_minutes,
    )

