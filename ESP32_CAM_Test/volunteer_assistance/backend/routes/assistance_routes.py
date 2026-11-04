import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, List

from ..database import get_db
from ..models import User, UserRole, VolunteerProfile, AssistanceRequest, RequestStatus
from ..schemas import (
    CreateAssistanceRequest, ExpandRadiusRequest, CancelAssistanceRequest,
    AssistanceRequestResponse, NearbyVolunteersStatus, VolunteerPublicInfo
)
from ..auth import get_current_user, require_role
from ..geospatial import (
    haversine_distance_km, calculate_approx_distance_text, fuzz_coordinates_for_privacy
)
from ..websockets import notification_hub
from ..atomic_claim import atomic_claim_request
from ..fcm import fcm_service

router = APIRouter(prefix="/api/assistance", tags=["Assistance Requests"])

@router.post("/request", response_model=NearbyVolunteersStatus)
async def create_assistance_request(
    data: CreateAssistanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BLIND_USER))
):
    # Check if user already has an active pending or accepted request
    existing = db.query(AssistanceRequest).filter(
        AssistanceRequest.blind_user_id == current_user.id,
        AssistanceRequest.status.in_([RequestStatus.PENDING, RequestStatus.ACCEPTED])
    ).first()

    if existing:
        return NearbyVolunteersStatus(
            request_id=existing.id,
            status=existing.status,
            volunteers_notified_count=0,
            radius_km=existing.radius_km,
            message=f"You already have an active {existing.status.value.lower()} request. Please complete or cancel it before requesting again."
        )

    # 1. Create the assistance request record
    req = AssistanceRequest(
        blind_user_id=current_user.id,
        status=RequestStatus.PENDING,
        latitude=data.latitude,
        longitude=data.longitude,
        assistance_type=data.assistance_type,
        notes=data.notes,
        radius_km=data.radius_km
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # 2. Find eligible volunteers:
    # - role == VOLUNTEER
    # - is_available == True
    # - location reported and not null
    # - distance <= radius_km
    available_profiles = db.query(VolunteerProfile).filter(
        VolunteerProfile.is_available == True,
        VolunteerProfile.last_latitude.isnot(None),
        VolunteerProfile.last_longitude.isnot(None)
    ).all()

    matched_volunteers = []
    matched_volunteer_ids = []

    for vp in available_profiles:
        dist_km = haversine_distance_km(data.latitude, data.longitude, vp.last_latitude, vp.last_longitude)
        if dist_km <= req.radius_km:
            matched_volunteers.append((vp, dist_km))
            matched_volunteer_ids.append(vp.user_id)

    # 3. Privacy-preserving coordinate fuzzing for the broadcast
    fuzzed_lat, fuzzed_lon = fuzz_coordinates_for_privacy(data.latitude, data.longitude)

    # 4. Notify matching volunteers in real-time over WebSocket
    for vp, dist in matched_volunteers:
        dist_text = calculate_approx_distance_text(dist)
        payload = {
            "type": "NEW_ASSISTANCE_REQUEST",
            "request_id": req.id,
            "blind_user_name": current_user.full_name,
            "assistance_type": req.assistance_type,
            "notes": req.notes,
            "approx_distance_km": dist,
            "approx_distance_text": dist_text,
            "created_at": req.created_at.isoformat(),
            "fuzzed_latitude": fuzzed_lat,
            "fuzzed_longitude": fuzzed_lon,
            "radius_km": req.radius_km
        }
        await notification_hub.send_to_user(vp.user_id, payload)

        # 5. Background push if FCM is enabled
        if vp.fcm_token:
            fcm_service.send_push_notification(
                token=vp.fcm_token,
                title="Assistance Needed Nearby",
                body=f"{current_user.full_name} needs {req.assistance_type} ({dist_text})",
                data={"request_id": req.id}
            )

    notified_count = len(matched_volunteers)
    if notified_count > 0:
        msg = f"Help request broadcast to {notified_count} nearby volunteer{'s' if notified_count > 1 else ''} within {req.radius_km} km."
    else:
        msg = f"No volunteers currently available within {req.radius_km} km. You can retry or expand your search radius."

    return NearbyVolunteersStatus(
        request_id=req.id,
        status=req.status,
        volunteers_notified_count=notified_count,
        radius_km=req.radius_km,
        message=msg
    )

@router.post("/{request_id}/accept", response_model=AssistanceRequestResponse)
async def accept_assistance_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER))
):
    # Atomic claim ensures only ONE volunteer gets it even under race conditions
    req = await atomic_claim_request(db, request_id, current_user)

    v_profile = current_user.volunteer_profile
    dist_km = None
    dist_text = None
    if v_profile and v_profile.last_latitude is not None and v_profile.last_longitude is not None:
        dist_km = haversine_distance_km(req.latitude, req.longitude, v_profile.last_latitude, v_profile.last_longitude)
        dist_text = calculate_approx_distance_text(dist_km)

    # 1. Notify the blind user immediately via WebSocket
    await notification_hub.send_to_user(req.blind_user_id, {
        "type": "REQUEST_ACCEPTED",
        "request_id": req.id,
        "status": RequestStatus.ACCEPTED.value,
        "volunteer": {
            "id": current_user.id,
            "name": current_user.full_name,
            "phone": current_user.phone_number or "Not provided",
            "approx_distance_text": dist_text or "Nearby"
        },
        "message": f"Volunteer {current_user.full_name} has accepted your request and is heading your way!"
    })

    # 2. Notify all volunteers so the request card disappears from other screens
    for v_id in list(notification_hub.volunteer_users):
        if v_id != current_user.id:
            await notification_hub.send_to_user(v_id, {
                "type": "REQUEST_CLAIMED_BY_OTHER",
                "request_id": req.id,
                "message": "This request was accepted by another volunteer."
            })

    return AssistanceRequestResponse(
        id=req.id,
        blind_user_id=req.blind_user_id,
        blind_user_name=req.blind_user.full_name if req.blind_user else "Blind User",
        status=req.status,
        assistance_type=req.assistance_type,
        notes=req.notes,
        radius_km=req.radius_km,
        created_at=req.created_at,
        accepted_at=req.accepted_at,
        latitude=req.latitude,   # Once accepted, precise coordinates are shared with assigned volunteer
        longitude=req.longitude,
        approx_distance_km=dist_km,
        approx_distance_text=dist_text,
        accepted_volunteer=VolunteerPublicInfo(
            id=current_user.id,
            full_name=current_user.full_name,
            phone_number=current_user.phone_number,
            approx_distance_km=dist_km,
            approx_distance_text=dist_text
        )
    )

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

    # Only requester or accepted volunteer can cancel
    if req.blind_user_id != current_user.id and req.accepted_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to cancel this request")

    req.status = RequestStatus.CANCELLED
    req.cancelled_at = datetime.now(timezone.utc)
    req.cancellation_reason = data.reason
    db.commit()

    # Notify both sides
    notify_payload = {
        "type": "REQUEST_CANCELLED",
        "request_id": req.id,
        "cancelled_by": current_user.full_name,
        "reason": data.reason
    }
    await notification_hub.send_to_user(req.blind_user_id, notify_payload)
    if req.accepted_by_id:
        await notification_hub.send_to_user(req.accepted_by_id, notify_payload)

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
    db.commit()

    notify_payload = {
        "type": "REQUEST_COMPLETED",
        "request_id": req.id,
        "message": "Assistance session marked as completed. Thank you!"
    }
    await notification_hub.send_to_user(req.blind_user_id, notify_payload)
    if req.accepted_by_id:
        await notification_hub.send_to_user(req.accepted_by_id, notify_payload)

    return {"status": "success", "message": "Assistance request completed."}

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
    db.commit()

    # Re-scan for volunteers
    available_profiles = db.query(VolunteerProfile).filter(
        VolunteerProfile.is_available == True,
        VolunteerProfile.last_latitude.isnot(None),
        VolunteerProfile.last_longitude.isnot(None)
    ).all()

    matched_count = 0
    fuzzed_lat, fuzzed_lon = fuzz_coordinates_for_privacy(req.latitude, req.longitude)

    for vp in available_profiles:
        dist_km = haversine_distance_km(req.latitude, req.longitude, vp.last_latitude, vp.last_longitude)
        if dist_km <= req.radius_km:
            matched_count += 1
            dist_text = calculate_approx_distance_text(dist_km)
            await notification_hub.send_to_user(vp.user_id, {
                "type": "NEW_ASSISTANCE_REQUEST",
                "request_id": req.id,
                "blind_user_name": current_user.full_name,
                "assistance_type": req.assistance_type,
                "notes": req.notes,
                "approx_distance_km": dist_km,
                "approx_distance_text": dist_text,
                "created_at": req.created_at.isoformat(),
                "fuzzed_latitude": fuzzed_lat,
                "fuzzed_longitude": fuzzed_lon,
                "radius_km": req.radius_km
            })

    msg = f"Radius expanded to {req.radius_km} km. Notified {matched_count} volunteer{'s' if matched_count != 1 else ''}."
    return NearbyVolunteersStatus(
        request_id=req.id,
        status=req.status,
        volunteers_notified_count=matched_count,
        radius_km=req.radius_km,
        message=msg
    )

@router.get("/active", response_model=Optional[AssistanceRequestResponse])
def get_active_assistance_request(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == UserRole.BLIND_USER:
        req = db.query(AssistanceRequest).filter(
            AssistanceRequest.blind_user_id == current_user.id,
            AssistanceRequest.status.in_([RequestStatus.PENDING, RequestStatus.ACCEPTED])
        ).order_by(AssistanceRequest.created_at.desc()).first()
    else:
        req = db.query(AssistanceRequest).filter(
            AssistanceRequest.accepted_by_id == current_user.id,
            AssistanceRequest.status == RequestStatus.ACCEPTED
        ).order_by(AssistanceRequest.accepted_at.desc()).first()

    if not req:
        return None

    vol_info = None
    dist_km = None
    dist_text = None

    if req.accepted_volunteer:
        v_prof = req.accepted_volunteer.volunteer_profile
        if v_prof and v_prof.last_latitude is not None and v_prof.last_longitude is not None:
            dist_km = haversine_distance_km(req.latitude, req.longitude, v_prof.last_latitude, v_prof.last_longitude)
            dist_text = calculate_approx_distance_text(dist_km)

        vol_info = VolunteerPublicInfo(
            id=req.accepted_volunteer.id,
            full_name=req.accepted_volunteer.full_name,
            phone_number=req.accepted_volunteer.phone_number,
            approx_distance_km=dist_km,
            approx_distance_text=dist_text
        )

    return AssistanceRequestResponse(
        id=req.id,
        blind_user_id=req.blind_user_id,
        blind_user_name=req.blind_user.full_name if req.blind_user else "Blind User",
        status=req.status,
        assistance_type=req.assistance_type,
        notes=req.notes,
        radius_km=req.radius_km,
        created_at=req.created_at,
        accepted_at=req.accepted_at,
        accepted_volunteer=vol_info,
        latitude=req.latitude,
        longitude=req.longitude,
        approx_distance_km=dist_km,
        approx_distance_text=dist_text
    )
