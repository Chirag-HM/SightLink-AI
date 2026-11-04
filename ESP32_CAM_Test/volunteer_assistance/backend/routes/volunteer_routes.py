from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import User, UserRole, VolunteerProfile, AssistanceRequest, RequestStatus
from ..schemas import (
    VolunteerAvailabilityUpdate, VolunteerLocationUpdate,
    AssistanceRequestResponse, VolunteerPublicInfo
)
from ..auth import require_role
from ..geospatial import (
    haversine_distance_km, calculate_approx_distance_text, fuzz_coordinates_for_privacy
)
from ..fcm import fcm_service

router = APIRouter(prefix="/api/volunteer", tags=["Volunteer"])

@router.put("/availability")
def update_availability(
    data: VolunteerAvailabilityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER))
):
    profile = current_user.volunteer_profile
    if not profile:
        profile = VolunteerProfile(user_id=current_user.id)
        db.add(profile)

    profile.is_available = data.is_available
    db.commit()
    db.refresh(profile)

    return {
        "status": "success",
        "is_available": profile.is_available,
        "message": "Availability updated successfully. You will now receive nearby alerts." if profile.is_available else "Availability turned off. You will not receive alerts."
    }

@router.put("/location")
def update_location(
    data: VolunteerLocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER))
):
    profile = current_user.volunteer_profile
    if not profile:
        profile = VolunteerProfile(user_id=current_user.id)
        db.add(profile)

    profile.last_latitude = data.latitude
    profile.last_longitude = data.longitude
    profile.last_location_updated_at = datetime.now(timezone.utc)
    profile.share_location_consent = data.share_consent
    if data.fcm_token:
        profile.fcm_token = data.fcm_token

    db.commit()
    db.refresh(profile)

    return {
        "status": "success",
        "latitude": data.latitude,
        "longitude": data.longitude,
        "share_consent": profile.share_location_consent,
        "updated_at": profile.last_location_updated_at.isoformat()
    }

@router.get("/pending-requests", response_model=List[AssistanceRequestResponse])
def get_nearby_pending_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER))
):
    profile = current_user.volunteer_profile
    if not profile or not profile.is_available:
        return []

    if profile.last_latitude is None or profile.last_longitude is None:
        return []

    v_lat = profile.last_latitude
    v_lon = profile.last_longitude

    pending = db.query(AssistanceRequest).filter(
        AssistanceRequest.status == RequestStatus.PENDING
    ).all()

    nearby_list = []
    for req in pending:
        dist_km = haversine_distance_km(req.latitude, req.longitude, v_lat, v_lon)
        if dist_km <= req.radius_km:
            fuzzed_lat, fuzzed_lon = fuzz_coordinates_for_privacy(req.latitude, req.longitude)
            blind_name = req.blind_user.full_name if req.blind_user else "Blind User"

            nearby_list.append(AssistanceRequestResponse(
                id=req.id,
                blind_user_id=req.blind_user_id,
                blind_user_name=blind_name,
                status=req.status,
                assistance_type=req.assistance_type,
                notes=req.notes,
                radius_km=req.radius_km,
                created_at=req.created_at,
                latitude=fuzzed_lat,
                longitude=fuzzed_lon,
                approx_distance_km=dist_km,
                approx_distance_text=calculate_approx_distance_text(dist_km)
            ))

    return nearby_list

@router.get("/status")
def get_volunteer_status(
    current_user: User = Depends(require_role(UserRole.VOLUNTEER))
):
    profile = current_user.volunteer_profile
    fcm_status = fcm_service.get_status()
    
    return {
        "volunteer_id": current_user.id,
        "full_name": current_user.full_name,
        "is_available": profile.is_available if profile else False,
        "has_location": bool(profile and profile.last_latitude is not None),
        "fcm_status": fcm_status
    }
