from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..atomic_claim import atomic_claim_live_assist, claim_lock
from ..auth import get_current_user, require_role, require_verified_email
from ..config import settings
from ..database import get_db
from ..family_events import emit_calm_family_event
from ..fcm import fcm_service
from ..geospatial import (
    calculate_approx_distance_text,
    fuzz_coordinates_for_privacy,
    haversine_distance_km,
)
from ..models import (
    AssistanceRequest,
    LiveAssistDecline,
    LiveAssistSession,
    LiveAssistStatus,
    PushSubscription,
    RequestStatus,
    User,
    UserBlock,
    UserRole,
    VolunteerProfile,
)
from ..schemas import (
    AudioFallbackRequest,
    CreateLiveAssistRequest,
    EndLiveAssistRequest,
    ExtendLiveAssistRequest,
    FlashToggleRequest,
    LiveAssistSessionResponse,
    QuickReplyPromptRequest,
    RateLiveAssistRequest,
    VolunteerPublicInfo,
)
from ..websockets import notification_hub
from .assistance_routes import _broadcast_to_nearby_volunteers

router = APIRouter(prefix="/api/live-assist", tags=["Eyes on Demand (Live Assist)"])


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def build_live_assist_response(
    sess: LiveAssistSession,
    *,
    fuzz_location: bool = False,
    viewer_lat: Optional[float] = None,
    viewer_lng: Optional[float] = None,
    is_remote_match: bool = False,
) -> LiveAssistSessionResponse:
    lat, lng = sess.lat, sess.lng
    if fuzz_location:
        lat, lng = fuzz_coordinates_for_privacy(sess.lat, sess.lng, fuzz_radius_meters=90.0)

    vol_info = None
    if sess.accepted_volunteer:
        v_prof = sess.accepted_volunteer.volunteer_profile
        vol_info = VolunteerPublicInfo(
            id=sess.accepted_volunteer.id,
            full_name=sess.accepted_volunteer.full_name,
            phone_number=sess.accepted_volunteer.phone_number,
            is_verified=bool(sess.accepted_volunteer.is_verified or (v_prof and v_prof.is_verified)),
            avg_rating=round(v_prof.avg_rating, 2) if v_prof else 5.0,
            rating_count=v_prof.rating_count if v_prof else 0,
        )

    dist_km = None
    dist_text = "Remote Video"
    if viewer_lat is not None and viewer_lng is not None:
        dist_km = haversine_distance_km(sess.lat, sess.lng, viewer_lat, viewer_lng)
        dist_text = calculate_approx_distance_text(dist_km) if not is_remote_match else f"Remote ({dist_km:.1f} km)"

    now = datetime.now(timezone.utc)
    remaining_sec = 0
    if sess.status == LiveAssistStatus.CONNECTED and sess.expires_at:
        exp = _as_utc(sess.expires_at)
        remaining_sec = max(0, int((exp - now).total_seconds()))
    elif sess.status == LiveAssistStatus.WAITING:
        remaining_sec = sess.duration_sec or settings.LIVE_ASSIST_DEFAULT_SECONDS

    created_utc = _as_utc(sess.created_at) or now
    return LiveAssistSessionResponse(
        id=sess.id,
        userId=sess.blind_user_id,
        blind_user_id=sess.blind_user_id,
        blind_user_name=sess.blind_user.full_name if sess.blind_user else "SightLink User",
        status=sess.status,
        lat=lat,
        lng=lng,
        createdAt=created_utc,
        created_at=created_utc,
        durationSec=sess.duration_sec or settings.LIVE_ASSIST_DEFAULT_SECONDS,
        duration_sec=sess.duration_sec or settings.LIVE_ASSIST_DEFAULT_SECONDS,
        remaining_sec=remaining_sec,
        outcome=sess.outcome,
        radius_km=sess.radius_km or 1.0,
        escalation_stage=sess.escalation_stage or 0,
        allow_remote=bool(sess.allow_remote),
        is_remote_match=is_remote_match,
        connection_mode=sess.connection_mode or "video",
        flash_requested=bool(sess.flash_requested),
        consent_confirmed=bool(sess.consent_confirmed),
        recording_enabled=bool(sess.recording_enabled),
        escalated_request_id=sess.escalated_request_id,
        accepted_volunteer=vol_info,
        approx_distance_km=dist_km,
        approx_distance_text=dist_text,
        rating=sess.rating,
        rating_comment=sess.rating_comment,
        expires_at=_as_utc(sess.expires_at),
    )


async def _broadcast_live_assist_to_volunteers(
    db: Session,
    sess: LiveAssistSession,
    blind_user: User,
    *,
    include_remote: bool = False,
) -> int:
    declined_ids = {
        d.volunteer_id
        for d in db.query(LiveAssistDecline).filter(LiveAssistDecline.session_id == sess.id).all()
    }
    blocked_ids = {
        b.blocked_user_id
        for b in db.query(UserBlock).filter(UserBlock.blocker_id == blind_user.id).all()
    } | {
        b.blocker_id
        for b in db.query(UserBlock).filter(UserBlock.blocked_user_id == blind_user.id).all()
    }

    on_duty_profiles = db.query(VolunteerProfile).filter(
        VolunteerProfile.is_available == True,
    ).all()

    matched = []
    for vp in on_duty_profiles:
        if vp.user_id in declined_ids or vp.user_id in blocked_ids:
            continue
        vol_user = vp.user or db.query(User).filter(User.id == vp.user_id).first()
        is_verified = bool((vol_user and vol_user.is_verified) or vp.is_verified)
        if not is_verified:
            continue  # Verified-volunteer-only access for Eyes on Demand

        if vp.last_latitude is not None and vp.last_longitude is not None:
            dist_km = haversine_distance_km(sess.lat, sess.lng, vp.last_latitude, vp.last_longitude)
            within = dist_km <= (sess.radius_km or 1.0)
            if within or (include_remote and sess.allow_remote):
                matched.append((vp, dist_km, not within))
        elif include_remote and sess.allow_remote:
            matched.append((vp, None, True))

    fuzzed_lat, fuzzed_lon = fuzz_coordinates_for_privacy(sess.lat, sess.lng, fuzz_radius_meters=90.0)
    matched.sort(key=lambda item: (item[2], item[1] if item[1] is not None else 9999.0))

    for vp, dist, is_remote in matched:
        dist_text = (
            f"Remote video ({dist:.1f} km)" if (is_remote and dist is not None)
            else "Remote video" if is_remote
            else calculate_approx_distance_text(dist)
        )
        payload = {
            "type": "NEW_LIVE_ASSIST_SESSION",
            "session_id": sess.id,
            "blind_user_id": blind_user.id,
            "blind_user_name": blind_user.full_name,
            "approx_distance_km": dist,
            "approx_distance_text": dist_text,
            "is_remote": is_remote,
            "radius_km": sess.radius_km,
            "duration_sec": sess.duration_sec,
            "created_at": (_as_utc(sess.created_at) or datetime.now(timezone.utc)).isoformat(),
            "fuzzed_latitude": fuzzed_lat,
            "fuzzed_longitude": fuzzed_lon,
            "push_actions": [
                {"action": "accept_live_assist", "title": "Accept"},
                {"action": "decline_live_assist", "title": "Decline"},
            ],
        }
        await notification_hub.send_to_user(vp.user_id, payload)

        if vp.fcm_token:
            fcm_service.send_push_notification(
                token=vp.fcm_token,
                title="Eyes on Demand: Live Video Needed",
                body=f"{blind_user.full_name} needs live camera guidance ({dist_text})",
                click_action="/volunteers",
                data={"live_assist_id": sess.id, "radius_km": sess.radius_km},
                actions=[
                    {"action": "accept_live_assist", "title": "Accept"},
                    {"action": "decline_live_assist", "title": "Decline"},
                ],
            )

        subs = db.query(PushSubscription).filter(PushSubscription.user_id == vp.user_id).all()
        for sub in subs:
            if sub.p256dh and sub.auth:
                fcm_service.send_web_push(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    payload={
                        "title": "Eyes on Demand: Live Video Needed",
                        "body": f"{blind_user.full_name} needs live camera guidance ({dist_text})",
                        "tag": f"live-{sess.id}",
                        "live_assist_id": sess.id,
                        "url": "/volunteers",
                        "actions": [
                            {"action": "accept_live_assist", "title": "Accept"},
                            {"action": "decline_live_assist", "title": "Decline"},
                        ],
                        "data": {"live_assist_id": sess.id, "radius_km": sess.radius_km},
                    },
                )

    return len(matched)


async def escalate_live_assist_step(db: Session, sess: LiveAssistSession) -> dict:
    """
    Escalate live-assist notification radius:
      Stage 0 (1 km) -> Stage 1 (3 km, 15s) -> Stage 2 (10 km + remote, 30s) -> Stage 3 (45s family + SOS fallback).
    """
    if sess.status != LiveAssistStatus.WAITING:
        return {"escalated": False, "stage": sess.escalation_stage, "volunteers_notified_count": 0}

    now = datetime.now(timezone.utc)
    blind_user = sess.blind_user or db.query(User).filter(User.id == sess.blind_user_id).first()

    if sess.escalation_stage == 0:
        sess.escalation_stage = 1
        sess.radius_km = 3.0
        sess.last_escalated_at = now
        db.commit()
        count = await _broadcast_live_assist_to_volunteers(db, sess, blind_user, include_remote=False) if blind_user else 0
        await notification_hub.send_to_user(sess.blind_user_id, {
            "type": "LIVE_ASSIST_RADIUS_ESCALATED",
            "session_id": sess.id,
            "radius_km": 3.0,
            "escalation_stage": 1,
            "message": "Widened live video search to 3 kilometers.",
        })
        return {"escalated": True, "stage": 1, "radius_km": 3.0, "volunteers_notified_count": count}

    if sess.escalation_stage == 1:
        sess.escalation_stage = 2
        sess.radius_km = 10.0
        sess.last_escalated_at = now
        db.commit()
        count = await _broadcast_live_assist_to_volunteers(db, sess, blind_user, include_remote=True) if blind_user else 0
        await notification_hub.send_to_user(sess.blind_user_id, {
            "type": "LIVE_ASSIST_RADIUS_ESCALATED",
            "session_id": sess.id,
            "radius_km": 10.0,
            "escalation_stage": 2,
            "message": "Widened live video search to 10 kilometers and remote verified volunteers.",
        })
        return {"escalated": True, "stage": 2, "radius_km": 10.0, "volunteers_notified_count": count}

    if sess.escalation_stage == 2:
        sess.escalation_stage = 3
        sess.last_escalated_at = now
        sess.outcome = sess.outcome or "no_join_45s_fallback"
        db.commit()
        first = blind_user.full_name.split()[0] if (blind_user and blind_user.full_name) else "User"
        await emit_calm_family_event(
            db,
            sess.blind_user_id,
            event_type="LIVE_ASSIST_NO_JOIN_FALLBACK",
            category="sos",
            title="No Volunteer Available Nearby",
            summary=f"No volunteer available nearby. {first} may need help (live video unjoined after 45 seconds). SOS offered.",
            urgent=True,
            metadata={"session_id": sess.id, "latitude": sess.lat, "longitude": sess.lng},
        )
        await notification_hub.send_to_user(sess.blind_user_id, {
            "type": "LIVE_ASSIST_NO_JOIN_FALLBACK",
            "session_id": sess.id,
            "escalation_stage": 3,
            "message": "No volunteer has joined within 45 seconds. Your family has been notified and SOS is ready.",
        })
        return {"escalated": True, "stage": 3, "radius_km": sess.radius_km, "volunteers_notified_count": 0}

    return {"escalated": False, "stage": sess.escalation_stage, "volunteers_notified_count": 0}


@router.post("/sessions")
async def create_live_assist_session(
    data: CreateLiveAssistRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    require_verified_email(current_user)
    existing = (
        db.query(LiveAssistSession)
        .filter(
            LiveAssistSession.blind_user_id == current_user.id,
            LiveAssistSession.status.in_([LiveAssistStatus.WAITING, LiveAssistStatus.CONNECTED]),
        )
        .first()
    )
    if existing:
        resp = build_live_assist_response(existing, fuzz_location=False).model_dump()
        resp["volunteers_notified_count"] = 0
        resp["message"] = "Connecting you to a volunteer."
        return resp

    window_start = datetime.now(timezone.utc) - timedelta(seconds=settings.RATE_LIMIT_WINDOW_SECONDS)
    recent_count = (
        db.query(LiveAssistSession)
        .filter(
            LiveAssistSession.blind_user_id == current_user.id,
            LiveAssistSession.created_at >= window_start,
        )
        .count()
    )
    if recent_count >= settings.RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded: maximum {settings.RATE_LIMIT_MAX_REQUESTS} live assist sessions per {settings.RATE_LIMIT_WINDOW_SECONDS // 60} minutes.",
        )

    now = datetime.now(timezone.utc)
    sess = LiveAssistSession(
        blind_user_id=current_user.id,
        status=LiveAssistStatus.WAITING,
        lat=data.latitude,
        lng=data.longitude,
        created_at=now,
        duration_sec=settings.LIVE_ASSIST_DEFAULT_SECONDS,
        radius_km=1.0,
        escalation_stage=0,
        last_escalated_at=now,
        allow_remote=data.allow_remote,
        consent_confirmed=data.consent_confirmed,
        recording_enabled=False,
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)

    notified_count = await _broadcast_live_assist_to_volunteers(db, sess, current_user, include_remote=False)

    first = current_user.full_name.split()[0] if current_user.full_name else "User"
    await emit_calm_family_event(
        db,
        current_user.id,
        event_type="LIVE_ASSIST_STARTED",
        category="help_request",
        title="Live Video Check Started",
        summary=f"{first} asked for quick Eyes on Demand video help",
        urgent=False,
        metadata={"session_id": sess.id},
    )

    payload = build_live_assist_response(sess, fuzz_location=False).model_dump()
    payload["volunteers_notified_count"] = notified_count
    payload["message"] = "Connecting you to a volunteer."
    return payload


@router.post("/{session_id}/escalate-radius")
async def trigger_live_assist_radius_escalation(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    sess = (
        db.query(LiveAssistSession)
        .filter(LiveAssistSession.id == session_id, LiveAssistSession.blind_user_id == current_user.id)
        .first()
    )
    if not sess:
        raise HTTPException(status_code=404, detail="Live assist session not found")
    return await escalate_live_assist_step(db, sess)


@router.get("/pending", response_model=List[LiveAssistSessionResponse])
def get_pending_live_assist_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER)),
):
    profile = current_user.volunteer_profile
    is_verified = bool(current_user.is_verified or (profile and profile.is_verified))
    if not is_verified or not profile or not profile.is_available:
        return []

    declined_ids = {
        d.session_id
        for d in db.query(LiveAssistDecline).filter(LiveAssistDecline.volunteer_id == current_user.id).all()
    }
    blocked_ids = {
        b.blocked_user_id
        for b in db.query(UserBlock).filter(UserBlock.blocker_id == current_user.id).all()
    } | {
        b.blocker_id
        for b in db.query(UserBlock).filter(UserBlock.blocked_user_id == current_user.id).all()
    }

    waiting = (
        db.query(LiveAssistSession)
        .filter(LiveAssistSession.status == LiveAssistStatus.WAITING)
        .order_by(LiveAssistSession.created_at.desc())
        .all()
    )

    v_lat = profile.last_latitude
    v_lon = profile.last_longitude
    results = []
    for sess in waiting:
        if sess.id in declined_ids or sess.blind_user_id in blocked_ids:
            continue
        is_remote_match = False
        if v_lat is not None and v_lon is not None:
            dist = haversine_distance_km(sess.lat, sess.lng, v_lat, v_lon)
            if dist > (sess.radius_km or 1.0):
                if not sess.allow_remote:
                    continue
                is_remote_match = True
        else:
            if not sess.allow_remote:
                continue
            is_remote_match = True

        results.append(
            build_live_assist_response(
                sess,
                fuzz_location=True,
                viewer_lat=v_lat,
                viewer_lng=v_lon,
                is_remote_match=is_remote_match,
            )
        )
    return results


@router.post("/{session_id}/accept", response_model=LiveAssistSessionResponse)
async def accept_live_assist_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER)),
):
    require_verified_email(current_user)
    sess = await atomic_claim_live_assist(db, session_id, current_user)
    v_prof = current_user.volunteer_profile
    vol_first = current_user.full_name.split()[0] if current_user.full_name else "Volunteer"

    await notification_hub.send_to_user(
        sess.blind_user_id,
        {
            "type": "LIVE_ASSIST_ACCEPTED",
            "session_id": sess.id,
            "status": sess.status.value,
            "voice_announcement": f"Connected with {vol_first}, verified volunteer. Camera is live.",
            "volunteer": {
                "id": current_user.id,
                "first_name": vol_first,
                "full_name": current_user.full_name,
                "is_verified": True,
                "avg_rating": round(v_prof.avg_rating, 2) if v_prof else 5.0,
            },
            "duration_sec": sess.duration_sec,
            "expires_at": sess.expires_at.isoformat() if sess.expires_at else None,
        },
    )

    for v_id in list(notification_hub.volunteer_users):
        if v_id != current_user.id:
            await notification_hub.send_to_user(
                v_id,
                {
                    "type": "LIVE_ASSIST_CLAIMED_BY_OTHER",
                    "session_id": sess.id,
                    "message": "Already taken",
                },
            )

    blind_user = sess.blind_user or db.query(User).filter(User.id == sess.blind_user_id).first()
    blind_first = blind_user.full_name.split()[0] if (blind_user and blind_user.full_name) else "User"
    await emit_calm_family_event(
        db,
        sess.blind_user_id,
        event_type="LIVE_ASSIST_CONNECTED",
        category="help_request",
        title="Volunteer Viewing Live Camera",
        summary=f"{blind_first} asked for help and {vol_first} is assisting via live video",
        urgent=False,
        metadata={"session_id": sess.id, "volunteer_first_name": vol_first},
    )

    return build_live_assist_response(sess, fuzz_location=False)


@router.post("/{session_id}/decline")
def decline_live_assist_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER)),
):
    sess = db.query(LiveAssistSession).filter(LiveAssistSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Live assist session not found")
    existing = (
        db.query(LiveAssistDecline)
        .filter(LiveAssistDecline.session_id == session_id, LiveAssistDecline.volunteer_id == current_user.id)
        .first()
    )
    if not existing:
        db.add(LiveAssistDecline(session_id=session_id, volunteer_id=current_user.id))
        db.commit()
    return {"status": "declined", "session_id": session_id}


@router.post("/{session_id}/extend")
async def extend_live_assist_timer(
    session_id: str,
    data: ExtendLiveAssistRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sess = db.query(LiveAssistSession).filter(LiveAssistSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Live assist session not found")
    if sess.blind_user_id != current_user.id and sess.accepted_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    now = datetime.now(timezone.utc)
    base_exp = _as_utc(sess.expires_at)
    if not base_exp or base_exp < now:
        base_exp = now
    sess.expires_at = base_exp + timedelta(seconds=data.extra_seconds)
    sess.duration_sec = (sess.duration_sec or settings.LIVE_ASSIST_DEFAULT_SECONDS) + data.extra_seconds
    db.commit()
    db.refresh(sess)

    remaining = max(0, int((_as_utc(sess.expires_at) - now).total_seconds()))
    payload = {
        "type": "LIVE_ASSIST_EXTENDED",
        "session_id": sess.id,
        "extra_seconds": data.extra_seconds,
        "duration_sec": sess.duration_sec,
        "remaining_sec": remaining,
        "expires_at": sess.expires_at.isoformat(),
        "voice_announcement": f"Extended by {data.extra_seconds} seconds.",
    }
    await notification_hub.send_to_user(sess.blind_user_id, payload)
    if sess.accepted_by_id:
        await notification_hub.send_to_user(sess.accepted_by_id, payload)
    return payload


@router.post("/{session_id}/quick-reply")
async def send_quick_reply_voice_prompt(
    session_id: str,
    data: QuickReplyPromptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER)),
):
    sess = db.query(LiveAssistSession).filter(LiveAssistSession.id == session_id).first()
    if not sess or sess.accepted_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the connected volunteer can send quick replies.")

    vol_first = current_user.full_name.split()[0] if current_user.full_name else "Volunteer"
    payload = {
        "type": "LIVE_ASSIST_QUICK_REPLY",
        "session_id": sess.id,
        "prompt_text": data.prompt_text.strip(),
        "from_volunteer": vol_first,
    }
    await notification_hub.send_to_user(sess.blind_user_id, payload)
    return {"status": "sent", **payload}


@router.post("/{session_id}/flash")
async def request_flash_toggle(
    session_id: str,
    data: FlashToggleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER)),
):
    sess = db.query(LiveAssistSession).filter(LiveAssistSession.id == session_id).first()
    if not sess or sess.accepted_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the connected volunteer can toggle flash.")

    sess.flash_requested = bool(data.flash_on)
    db.commit()
    payload = {
        "type": "LIVE_ASSIST_FLASH_TOGGLE",
        "session_id": sess.id,
        "flash_on": bool(data.flash_on),
    }
    await notification_hub.send_to_user(sess.blind_user_id, payload)
    return {"status": "sent", **payload}


@router.post("/{session_id}/audio-fallback")
async def fallback_to_audio_only(
    session_id: str,
    data: AudioFallbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sess = db.query(LiveAssistSession).filter(LiveAssistSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Live assist session not found")
    if sess.blind_user_id != current_user.id and sess.accepted_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    sess.connection_mode = "audio_only"
    db.commit()
    payload = {
        "type": "LIVE_ASSIST_AUDIO_FALLBACK",
        "session_id": sess.id,
        "connection_mode": "audio_only",
        "reason": data.reason,
        "voice_announcement": "Connection is weak. Dropped to audio only.",
    }
    await notification_hub.send_to_user(sess.blind_user_id, payload)
    if sess.accepted_by_id:
        await notification_hub.send_to_user(sess.accepted_by_id, payload)
    return payload


@router.post("/{session_id}/escalate")
async def escalate_live_assist_to_in_person(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Convert an Eyes on Demand video session into an in-person AssistanceRequest
    carrying location & context, alerting nearby volunteers and announcing 'Someone is on the way.'
    """
    async with claim_lock:
        sess = db.query(LiveAssistSession).filter(LiveAssistSession.id == session_id).first()
        if not sess:
            raise HTTPException(status_code=404, detail="Live assist session not found")
        if sess.blind_user_id != current_user.id and sess.accepted_by_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to escalate this session")

        if sess.escalated_request_id:
            req = db.query(AssistanceRequest).filter(AssistanceRequest.id == sess.escalated_request_id).first()
            if req:
                return {
                    "status": "escalated",
                    "session_id": sess.id,
                    "assistance_request_id": req.id,
                    "voice_announcement": "Someone is on the way.",
                    "already_escalated": True,
                }

        now = datetime.now(timezone.utc)
        req = AssistanceRequest(
            blind_user_id=sess.blind_user_id,
            status=RequestStatus.PENDING,
            latitude=sess.lat,
            longitude=sess.lng,
            assistance_type="other",
            notes=f"Escalated from Eyes on Demand video session ({sess.id[:8]})",
            radius_km=1.0,
            escalation_stage=1,
            last_escalated_at=now,
        )
        db.add(req)
        db.commit()
        db.refresh(req)

        sess.status = LiveAssistStatus.ESCALATED
        sess.outcome = "escalated"
        sess.ended_at = now
        sess.escalated_request_id = req.id
        db.commit()
        db.refresh(sess)

    blind_user = sess.blind_user or db.query(User).filter(User.id == sess.blind_user_id).first()
    notified_count = await _broadcast_to_nearby_volunteers(db, req, blind_user) if blind_user else 0

    first = blind_user.full_name.split()[0] if (blind_user and blind_user.full_name) else "User"
    await emit_calm_family_event(
        db,
        sess.blind_user_id,
        event_type="LIVE_ASSIST_ESCALATED_IN_PERSON",
        category="help_request",
        title="Escalated to In-Person Help",
        summary=f"{first}'s video check escalated to an in-person volunteer request",
        urgent=False,
        metadata={"session_id": sess.id, "assistance_request_id": req.id},
    )

    msg_payload = {
        "type": "LIVE_ASSIST_ESCALATED",
        "session_id": sess.id,
        "assistance_request_id": req.id,
        "volunteers_notified_count": notified_count,
        "voice_announcement": "Someone is on the way.",
    }
    await notification_hub.send_to_user(sess.blind_user_id, msg_payload)
    if sess.accepted_by_id:
        await notification_hub.send_to_user(sess.accepted_by_id, msg_payload)

    return {
        "status": "escalated",
        "session_id": sess.id,
        "assistance_request_id": req.id,
        "volunteers_notified_count": notified_count,
        "voice_announcement": "Someone is on the way.",
    }


@router.post("/{session_id}/end")
async def end_live_assist_session(
    session_id: str,
    data: EndLiveAssistRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sess = db.query(LiveAssistSession).filter(LiveAssistSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Live assist session not found")
    if sess.blind_user_id != current_user.id and sess.accepted_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if sess.status not in (LiveAssistStatus.ENDED, LiveAssistStatus.ESCALATED):
        sess.status = LiveAssistStatus.ENDED
        sess.outcome = data.outcome or "completed"
        sess.ended_at = datetime.now(timezone.utc)
        if sess.accepted_volunteer and sess.accepted_volunteer.volunteer_profile and data.outcome == "completed":
            sess.accepted_volunteer.volunteer_profile.completed_count += 1
        db.commit()

        await emit_calm_family_event(
            db,
            sess.blind_user_id,
            event_type="LIVE_ASSIST_ENDED",
            category="help_request",
            title="Help Session Finished Safely",
            summary="Help session finished safely",
            urgent=False,
            metadata={"session_id": sess.id, "outcome": sess.outcome},
        )

    payload = {
        "type": "LIVE_ASSIST_ENDED",
        "session_id": sess.id,
        "outcome": sess.outcome,
        "voice_announcement": "Live video session ended safely.",
    }
    await notification_hub.send_to_user(sess.blind_user_id, payload)
    if sess.accepted_by_id:
        await notification_hub.send_to_user(sess.accepted_by_id, payload)

    return {"status": "ended", "session_id": sess.id, "outcome": sess.outcome}


@router.post("/{session_id}/rate")
def rate_live_assist_session(
    session_id: str,
    data: RateLiveAssistRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER)),
):
    sess = (
        db.query(LiveAssistSession)
        .filter(LiveAssistSession.id == session_id, LiveAssistSession.blind_user_id == current_user.id)
        .first()
    )
    if not sess:
        raise HTTPException(status_code=404, detail="Live assist session not found")
    if sess.status not in (LiveAssistStatus.ENDED, LiveAssistStatus.ESCALATED):
        raise HTTPException(status_code=400, detail="Session must finish before rating.")
    if sess.rating is not None:
        raise HTTPException(status_code=400, detail="You already rated this session.")

    sess.rating = data.rating
    sess.rating_comment = data.comment
    if sess.accepted_volunteer and sess.accepted_volunteer.volunteer_profile:
        vp = sess.accepted_volunteer.volunteer_profile
        total = (vp.avg_rating * vp.rating_count) + data.rating
        vp.rating_count += 1
        vp.avg_rating = round(total / vp.rating_count, 2)
    db.commit()
    return {"status": "rated", "session_id": sess.id, "rating": sess.rating}


@router.get("/active", response_model=Optional[LiveAssistSessionResponse])
def get_active_live_assist_session(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.BLIND_USER:
        sess = (
            db.query(LiveAssistSession)
            .filter(
                LiveAssistSession.blind_user_id == current_user.id,
                LiveAssistSession.status.in_([LiveAssistStatus.WAITING, LiveAssistStatus.CONNECTED]),
            )
            .order_by(LiveAssistSession.created_at.desc())
            .first()
        )
    else:
        sess = (
            db.query(LiveAssistSession)
            .filter(
                LiveAssistSession.accepted_by_id == current_user.id,
                LiveAssistSession.status == LiveAssistStatus.CONNECTED,
            )
            .order_by(LiveAssistSession.accepted_at.desc())
            .first()
        )
    if not sess:
        return None
    return build_live_assist_response(sess, fuzz_location=False)


@router.get("/history", response_model=List[LiveAssistSessionResponse])
def get_live_assist_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.BLIND_USER:
        rows = (
            db.query(LiveAssistSession)
            .filter(LiveAssistSession.blind_user_id == current_user.id)
            .order_by(LiveAssistSession.created_at.desc())
            .limit(30)
            .all()
        )
    else:
        rows = (
            db.query(LiveAssistSession)
            .filter(LiveAssistSession.accepted_by_id == current_user.id)
            .order_by(LiveAssistSession.created_at.desc())
            .limit(30)
            .all()
        )
    return [build_live_assist_response(r, fuzz_location=False) for r in rows]

