from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, List

from ..config import settings
from ..database import get_db
from ..models import (
    User, UserRole, VolunteerProfile, AssistanceRequest, RequestStatus,
    RequestDecline, UserBlock, PushSubscription
)
from ..schemas import (
    CreateAssistanceRequest, ExpandRadiusRequest, CancelAssistanceRequest,
    RateAssistanceRequest, BlindUserLocationUpdate,
    AssistanceRequestResponse, NearbyVolunteersStatus
)
from ..auth import get_current_user, require_role, require_verified_email
from ..geospatial import (
    haversine_distance_km, calculate_approx_distance_text,
    estimate_walking_eta_minutes, fuzz_coordinates_for_privacy
)
from ..websockets import notification_hub
from ..atomic_claim import atomic_claim_request
from ..fcm import fcm_service
from ..notifications_helper import notify_family_event, build_assistance_response

router = APIRouter(prefix="/api/assistance", tags=["Assistance Requests"])


async def _broadcast_to_nearby_volunteers(
    db: Session,
    req: AssistanceRequest,
    blind_user: User,
) -> int:
    declined_ids = {
        d.volunteer_id
        for d in db.query(RequestDecline).filter(RequestDecline.request_id == req.id).all()
    }
    blocked_ids = {
        b.blocked_user_id
        for b in db.query(UserBlock).filter(UserBlock.blocker_id == blind_user.id).all()
    } | {
        b.blocker_id
        for b in db.query(UserBlock).filter(UserBlock.blocked_user_id == blind_user.id).all()
    }

    available_profiles = db.query(VolunteerProfile).filter(
        VolunteerProfile.is_available == True,
        VolunteerProfile.last_latitude.isnot(None),
        VolunteerProfile.last_longitude.isnot(None),
    ).all()

    matched_volunteers = []
    for vp in available_profiles:
        if vp.user_id in declined_ids or vp.user_id in blocked_ids:
            continue
        dist_km = haversine_distance_km(req.latitude, req.longitude, vp.last_latitude, vp.last_longitude)
        if dist_km <= req.radius_km:
            matched_volunteers.append((vp, dist_km))

    # If no volunteer is within immediate walking radius (e.g. 0.5km),
    # expand search up to 50 km (Bangalore metropolitan area) so available on-duty volunteers receive the alert
    if not matched_volunteers:
        for vp in available_profiles:
            if vp.user_id in declined_ids or vp.user_id in blocked_ids:
                continue
            dist_km = haversine_distance_km(req.latitude, req.longitude, vp.last_latitude, vp.last_longitude)
            if dist_km <= 50.0:
                matched_volunteers.append((vp, dist_km))

    fuzzed_lat, fuzzed_lon = fuzz_coordinates_for_privacy(req.latitude, req.longitude)

    for vp, dist in matched_volunteers:
        dist_text = calculate_approx_distance_text(dist)
        eta_min = estimate_walking_eta_minutes(dist)
        payload = {
            "type": "NEW_ASSISTANCE_REQUEST",
            "request_id": req.id,
            "blind_user_id": blind_user.id,
            "blind_user_name": blind_user.full_name,
            "assistance_type": req.assistance_type,
            "notes": req.notes,
            "approx_distance_km": dist,
            "approx_distance_text": dist_text,
            "eta_minutes": eta_min,
            "created_at": req.created_at.isoformat(),
            "fuzzed_latitude": fuzzed_lat,
            "fuzzed_longitude": fuzzed_lon,
            "radius_km": req.radius_km,
            "escalation_stage": req.escalation_stage,
            "push_actions": [
                {"action": "accept", "title": "Accept"},
                {"action": "decline", "title": "Decline"},
            ],
        }
        await notification_hub.send_to_user(vp.user_id, payload)

        if vp.fcm_token:
            fcm_service.send_push_notification(
                token=vp.fcm_token,
                title="Assistance Needed Nearby",
                body=f"{blind_user.full_name} needs {req.assistance_type.replace('_', ' ')} ({dist_text})",
                data={"request_id": req.id, "radius_km": req.radius_km},
                actions=[
                    {"action": "accept", "title": "Accept"},
                    {"action": "decline", "title": "Decline"},
                ],
            )

        # Also dispatch encrypted VAPID Web Push for volunteers subscribed via Service Worker
        vol_subs = db.query(PushSubscription).filter(PushSubscription.user_id == vp.user_id).all()
        for sub in vol_subs:
            if sub.p256dh and sub.auth:
                fcm_service.send_web_push(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    payload={
                        "title": "Assistance Needed Nearby",
                        "body": f"{blind_user.full_name} needs {req.assistance_type.replace('_', ' ')} ({dist_text})",
                        "tag": req.id,
                        "request_id": req.id,
                        "url": "/volunteers",
                        "actions": [
                            {"action": "accept", "title": "Accept"},
                            {"action": "decline", "title": "Decline"},
                        ],
                        "data": {"request_id": req.id, "radius_km": req.radius_km},
                    },
                )

    return len(matched_volunteers)


async def escalate_request_step(db: Session, req: AssistanceRequest) -> dict:
    """
    Advance escalation stage:
      Stage 0 (0.5 km / 500m) -> Stage 1 (1.0 km) -> Stage 2 (3.0 km) -> Stage 3 (alert family + offer SOS).
    """
    if req.status != RequestStatus.PENDING:
        return {"escalated": False, "stage": req.escalation_stage, "volunteers_notified_count": 0}

    now = datetime.now(timezone.utc)
    blind_user = req.blind_user or db.query(User).filter(User.id == req.blind_user_id).first()

    if req.escalation_stage == 0:
        req.escalation_stage = 1
        req.radius_km = 1.0
        req.last_escalated_at = now
        db.commit()
        count = await _broadcast_to_nearby_volunteers(db, req, blind_user) if blind_user else 0
        await notification_hub.send_to_user(req.blind_user_id, {
            "type": "RADIUS_ESCALATED",
            "request_id": req.id,
            "radius_km": 1.0,
            "escalation_stage": 1,
            "volunteers_notified_count": count,
            "message": "Widened search radius to 1 kilometer. Looking for volunteers nearby.",
        })
        return {"escalated": True, "stage": 1, "radius_km": 1.0, "volunteers_notified_count": count}

    if req.escalation_stage == 1:
        req.escalation_stage = 2
        req.radius_km = 3.0
        req.last_escalated_at = now
        db.commit()
        count = await _broadcast_to_nearby_volunteers(db, req, blind_user) if blind_user else 0
        await notification_hub.send_to_user(req.blind_user_id, {
            "type": "RADIUS_ESCALATED",
            "request_id": req.id,
            "radius_km": 3.0,
            "escalation_stage": 2,
            "volunteers_notified_count": count,
            "message": "Widened search radius to 3 kilometers.",
        })
        return {"escalated": True, "stage": 2, "radius_km": 3.0, "volunteers_notified_count": count}

    if req.escalation_stage == 2:
        req.escalation_stage = 3
        req.last_escalated_at = now
        req.no_volunteer_alerted_at = now
        db.commit()
        first = blind_user.full_name.strip().split()[0] if (blind_user and blind_user.full_name) else "User"
        if blind_user:
            await notify_family_event(
                db,
                blind_user.id,
                event_type="NO_VOLUNTEER_AVAILABLE",
                title="No Volunteer Available Nearby",
                body=f"No volunteer available nearby. {first} may need help.",
                extra={"request_id": req.id, "latitude": req.latitude, "longitude": req.longitude},
            )
        await notification_hub.send_to_user(req.blind_user_id, {
            "type": "ESCALATED_TO_FAMILY_AND_SOS",
            "request_id": req.id,
            "radius_km": req.radius_km,
            "escalation_stage": 3,
            "message": "No volunteer accepted within 3 kilometers. Your family contacts have been alerted. You can trigger SOS now.",
        })
        return {"escalated": True, "stage": 3, "radius_km": req.radius_km, "volunteers_notified_count": 0}

    return {"escalated": False, "stage": req.escalation_stage, "volunteers_notified_count": 0}


@router.post("/request", response_model=NearbyVolunteersStatus)
async def create_assistance_request(
    data: CreateAssistanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER))
):
    require_verified_email(current_user)
    # Return active request if user already has one in flight
    existing = db.query(AssistanceRequest).filter(
        AssistanceRequest.blind_user_id == current_user.id,
        AssistanceRequest.status.in_([RequestStatus.PENDING, RequestStatus.ACCEPTED, RequestStatus.ARRIVED])
    ).first()

    if existing:
        return NearbyVolunteersStatus(
            request_id=existing.id,
            status=existing.status,
            volunteers_notified_count=0,
            radius_km=existing.radius_km,
            escalation_stage=existing.escalation_stage or 0,
            message=f"You already have an active {existing.status.value.lower()} request. Please complete or cancel it first."
        )

    # Anti-abuse sliding-window rate limiting
    window_start = datetime.now(timezone.utc) - timedelta(seconds=settings.RATE_LIMIT_WINDOW_SECONDS)
    recent_count = db.query(AssistanceRequest).filter(
        AssistanceRequest.blind_user_id == current_user.id,
        AssistanceRequest.created_at >= window_start
    ).count()
    if recent_count >= settings.RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded: maximum {settings.RATE_LIMIT_MAX_REQUESTS} help requests per {settings.RATE_LIMIT_WINDOW_SECONDS // 60} minutes."
        )

    initial_radius = data.radius_km if data.radius_km else settings.DEFAULT_SEARCH_RADIUS_KM
    now = datetime.now(timezone.utc)

    req = AssistanceRequest(
        blind_user_id=current_user.id,
        status=RequestStatus.PENDING,
        latitude=data.latitude,
        longitude=data.longitude,
        assistance_type=data.assistance_type,
        notes=data.notes,
        radius_km=initial_radius,
        escalation_stage=0,
        last_escalated_at=now,
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    notified_count = await _broadcast_to_nearby_volunteers(db, req, current_user)

    # Notify family members that a help request started
    await notify_family_event(
        db,
        current_user.id,
        event_type="HELP_REQUEST_STARTED",
        title="Assistance Request Started",
        body=f"{current_user.full_name} requested {req.assistance_type.replace('_', ' ')} assistance.",
        extra={"request_id": req.id, "latitude": req.latitude, "longitude": req.longitude},
    )

    radius_label = f"{int(req.radius_km * 1000)} meters" if req.radius_km < 1 else f"{req.radius_km} km"
    if notified_count > 0:
        msg = f"Looking for a volunteer nearby. Notified {notified_count} volunteer{'s' if notified_count > 1 else ''} within {radius_label}."
    else:
        msg = f"Looking for a volunteer nearby. Scanning within {radius_label}; widening automatically if needed."

    return NearbyVolunteersStatus(
        request_id=req.id,
        status=req.status,
        volunteers_notified_count=notified_count,
        radius_km=req.radius_km,
        escalation_stage=req.escalation_stage,
        message=msg,
    )


@router.post("/{request_id}/escalate")
async def trigger_request_escalation(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER))
):
    req = db.query(AssistanceRequest).filter(
        AssistanceRequest.id == request_id,
        AssistanceRequest.blind_user_id == current_user.id
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return await escalate_request_step(db, req)


@router.post("/{request_id}/accept", response_model=AssistanceRequestResponse)
async def accept_assistance_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER))
):
    require_verified_email(current_user)
    req = await atomic_claim_request(db, request_id, current_user)

    v_profile = current_user.volunteer_profile
    dist_km = None
    eta_minutes = 3
    if v_profile and v_profile.last_latitude is not None and v_profile.last_longitude is not None:
        dist_km = haversine_distance_km(req.latitude, req.longitude, v_profile.last_latitude, v_profile.last_longitude)
        eta_minutes = estimate_walking_eta_minutes(dist_km)

    first_name = current_user.full_name.split()[0] if current_user.full_name else "A volunteer"
    spoken_eta = f"{first_name} is coming, {eta_minutes} minute{'s' if eta_minutes != 1 else ''} away"
    dist_text = calculate_approx_distance_text(dist_km) if dist_km is not None else "Nearby"

    await notification_hub.send_to_user(req.blind_user_id, {
        "type": "REQUEST_ACCEPTED",
        "request_id": req.id,
        "status": RequestStatus.ACCEPTED.value,
        "announcement": spoken_eta,
        "volunteer": {
            "id": current_user.id,
            "name": current_user.full_name,
            "full_name": current_user.full_name,
            "phone": current_user.phone_number or "Not provided",
            "phone_number": current_user.phone_number,
            "is_verified": bool(current_user.is_verified or (v_profile and v_profile.is_verified)),
            "avg_rating": round(v_profile.avg_rating, 2) if v_profile else 5.0,
            "latitude": v_profile.last_latitude if v_profile else None,
            "longitude": v_profile.last_longitude if v_profile else None,
            "eta_minutes": eta_minutes,
            "approx_distance_km": dist_km,
            "approx_distance_text": dist_text,
        },
        "message": spoken_eta,
    })

    # Notify other connected volunteers to dismiss card
    for v_id in list(notification_hub.volunteer_users):
        if v_id != current_user.id:
            await notification_hub.send_to_user(v_id, {
                "type": "REQUEST_CLAIMED_BY_OTHER",
                "request_id": req.id,
                "message": "This request was accepted by another volunteer."
            })

    # Notify linked family watchers
    await notify_family_event(
        db,
        req.blind_user_id,
        event_type="HELP_REQUEST_ACCEPTED",
        title="Volunteer On The Way",
        body=f"{current_user.full_name} accepted the help request ({eta_minutes} min away).",
        extra={
            "request_id": req.id,
            "volunteer_name": current_user.full_name,
            "eta_minutes": eta_minutes,
            "latitude": req.latitude,
            "longitude": req.longitude,
        },
    )

    return build_assistance_response(req, fuzz_location=False)


@router.post("/{request_id}/decline")
async def decline_assistance_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER))
):
    require_verified_email(current_user)
    req = db.query(AssistanceRequest).filter(AssistanceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    existing = db.query(RequestDecline).filter(
        RequestDecline.request_id == request_id,
        RequestDecline.volunteer_id == current_user.id
    ).first()
    if not existing:
        db.add(RequestDecline(request_id=request_id, volunteer_id=current_user.id))
        db.commit()

    return {"status": "declined", "request_id": request_id}


@router.post("/{request_id}/arrived")
async def mark_volunteer_arrived(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    req = db.query(AssistanceRequest).filter(AssistanceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.blind_user_id != current_user.id and req.accepted_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this request")

    req.status = RequestStatus.ARRIVED
    req.arrived_at = datetime.now(timezone.utc)
    db.commit()

    v_name = req.accepted_volunteer.full_name.split()[0] if req.accepted_volunteer else "Your volunteer"
    payload = {
        "type": "VOLUNTEER_ARRIVED",
        "request_id": req.id,
        "status": RequestStatus.ARRIVED.value,
        "message": f"{v_name} has arrived at your location.",
    }
    await notification_hub.send_to_user(req.blind_user_id, payload)
    if req.accepted_by_id:
        await notification_hub.send_to_user(req.accepted_by_id, payload)

    await notify_family_event(
        db,
        req.blind_user_id,
        event_type="HELP_REQUEST_ARRIVED",
        title="Volunteer Arrived",
        body=f"{v_name} has arrived to assist.",
        extra={"request_id": req.id},
    )

    return {"status": "arrived", "request_id": req.id}


@router.put("/{request_id}/location")
async def update_active_request_location(
    request_id: str,
    data: BlindUserLocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Allow blind user or assigned volunteer to stream live coordinates during an active session."""
    req = db.query(AssistanceRequest).filter(AssistanceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.blind_user_id != current_user.id and req.accepted_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if current_user.id == req.blind_user_id:
        req.latitude = data.latitude
        req.longitude = data.longitude
        db.commit()
        if req.accepted_by_id:
            await notification_hub.send_to_user(req.accepted_by_id, {
                "type": "LIVE_LOCATION_UPDATE",
                "request_id": req.id,
                "party": "blind_user",
                "latitude": data.latitude,
                "longitude": data.longitude,
            })
    else:
        prof = current_user.volunteer_profile
        if prof and prof.is_available:
            prof.last_latitude = data.latitude
            prof.last_longitude = data.longitude
            prof.last_location_updated_at = datetime.now(timezone.utc)
            db.commit()
        dist_km = haversine_distance_km(req.latitude, req.longitude, data.latitude, data.longitude)
        await notification_hub.send_to_user(req.blind_user_id, {
            "type": "LIVE_LOCATION_UPDATE",
            "request_id": req.id,
            "party": "volunteer",
            "latitude": data.latitude,
            "longitude": data.longitude,
            "approx_distance_km": dist_km,
            "eta_minutes": estimate_walking_eta_minutes(dist_km),
        })

    return {"status": "updated"}


@router.post("/{request_id}/cancel")
async def cancel_assistance_request(
    request_id: str,
    data: CancelAssistanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    req = db.query(AssistanceRequest).filter(AssistanceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.blind_user_id != current_user.id and req.accepted_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to cancel this request")

    req.status = RequestStatus.CANCELLED
    req.cancelled_at = datetime.now(timezone.utc)
    req.cancellation_reason = data.reason
    db.commit()

    notify_payload = {
        "type": "REQUEST_CANCELLED",
        "request_id": req.id,
        "cancelled_by": current_user.full_name,
        "reason": data.reason
    }
    await notification_hub.send_to_user(req.blind_user_id, notify_payload)
    if req.accepted_by_id:
        await notification_hub.send_to_user(req.accepted_by_id, notify_payload)

    # Notify connected volunteers so pending request card disappears
    for v_id in list(notification_hub.volunteer_users):
        await notification_hub.send_to_user(v_id, notify_payload)

    await notify_family_event(
        db,
        req.blind_user_id,
        event_type="HELP_REQUEST_CANCELLED",
        title="Help Request Cancelled",
        body=f"The assistance request was cancelled ({data.reason or 'by user'}).",
        extra={"request_id": req.id},
    )

    return {"status": "success", "message": "Request cancelled successfully."}


@router.post("/{request_id}/complete")
async def complete_assistance_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    req = db.query(AssistanceRequest).filter(AssistanceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.blind_user_id != current_user.id and req.accepted_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to complete this request")

    req.status = RequestStatus.COMPLETED
    req.completed_at = datetime.now(timezone.utc)
    if req.accepted_volunteer and req.accepted_volunteer.volunteer_profile:
        req.accepted_volunteer.volunteer_profile.completed_count += 1
    db.commit()

    notify_payload = {
        "type": "REQUEST_COMPLETED",
        "request_id": req.id,
        "message": "Assistance session marked as completed. Thank you!"
    }
    await notification_hub.send_to_user(req.blind_user_id, notify_payload)
    if req.accepted_by_id:
        await notification_hub.send_to_user(req.accepted_by_id, notify_payload)

    await notify_family_event(
        db,
        req.blind_user_id,
        event_type="HELP_REQUEST_COMPLETED",
        title="Assistance Completed",
        body="The assistance session has been safely completed.",
        extra={"request_id": req.id, "latitude": req.latitude, "longitude": req.longitude},
    )

    return {"status": "success", "message": "Assistance request completed."}


@router.post("/{request_id}/rate")
def rate_assistance_request(
    request_id: str,
    data: RateAssistanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER))
):
    req = db.query(AssistanceRequest).filter(
        AssistanceRequest.id == request_id,
        AssistanceRequest.blind_user_id == current_user.id
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != RequestStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Only completed sessions can be rated.")
    if req.rating is not None:
        raise HTTPException(status_code=400, detail="You already submitted a rating for this session.")

    req.rating = data.rating
    req.rating_comment = data.comment
    if req.accepted_volunteer and req.accepted_volunteer.volunteer_profile:
        vp = req.accepted_volunteer.volunteer_profile
        total = (vp.avg_rating * vp.rating_count) + data.rating
        vp.rating_count += 1
        vp.avg_rating = round(total / vp.rating_count, 2)
    db.commit()

    return {
        "status": "rated",
        "request_id": req.id,
        "rating": req.rating,
        "rating_comment": req.rating_comment,
    }


@router.post("/{request_id}/expand-radius", response_model=NearbyVolunteersStatus)
async def expand_search_radius(
    request_id: str,
    data: ExpandRadiusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER))
):
    req = db.query(AssistanceRequest).filter(
        AssistanceRequest.id == request_id,
        AssistanceRequest.blind_user_id == current_user.id
    ).first()

    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.status != RequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Only pending requests can expand radius")

    req.radius_km = data.new_radius_km
    if data.new_radius_km >= 3.0:
        req.escalation_stage = max(req.escalation_stage or 0, 2)
    elif data.new_radius_km >= 1.0:
        req.escalation_stage = max(req.escalation_stage or 0, 1)
    req.last_escalated_at = datetime.now(timezone.utc)
    db.commit()

    blind_user = current_user
    matched_count = await _broadcast_to_nearby_volunteers(db, req, blind_user)

    msg = f"Radius expanded to {req.radius_km} km. Notified {matched_count} volunteer{'s' if matched_count != 1 else ''}."
    return NearbyVolunteersStatus(
        request_id=req.id,
        status=req.status,
        volunteers_notified_count=matched_count,
        radius_km=req.radius_km,
        escalation_stage=req.escalation_stage,
        message=msg,
    )


@router.get("/active", response_model=Optional[AssistanceRequestResponse])
def get_active_assistance_request(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == UserRole.BLIND_USER:
        req = db.query(AssistanceRequest).filter(
            AssistanceRequest.blind_user_id == current_user.id,
            AssistanceRequest.status.in_([RequestStatus.PENDING, RequestStatus.ACCEPTED, RequestStatus.ARRIVED])
        ).order_by(AssistanceRequest.created_at.desc()).first()
    else:
        req = db.query(AssistanceRequest).filter(
            AssistanceRequest.accepted_by_id == current_user.id,
            AssistanceRequest.status.in_([RequestStatus.ACCEPTED, RequestStatus.ARRIVED])
        ).order_by(AssistanceRequest.accepted_at.desc()).first()

    if not req:
        return None

    return build_assistance_response(req, fuzz_location=False)


@router.get("/history", response_model=List[AssistanceRequestResponse])
def get_my_assistance_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == UserRole.BLIND_USER:
        rows = (
            db.query(AssistanceRequest)
            .filter(AssistanceRequest.blind_user_id == current_user.id)
            .order_by(AssistanceRequest.created_at.desc())
            .limit(30)
            .all()
        )
    else:
        rows = (
            db.query(AssistanceRequest)
            .filter(AssistanceRequest.accepted_by_id == current_user.id)
            .order_by(AssistanceRequest.created_at.desc())
            .limit(30)
            .all()
        )
    return [build_assistance_response(r, fuzz_location=False) for r in rows]
