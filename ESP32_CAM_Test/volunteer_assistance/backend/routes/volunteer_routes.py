from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import (
    User, UserRole, VolunteerProfile, AssistanceRequest, RequestStatus,
    RequestDecline, UserBlock, OTPVerification
)
from ..schemas import (
    VolunteerAvailabilityUpdate, VolunteerLocationUpdate,
    AssistanceRequestResponse, VolunteerVerifyRequest
)
from ..auth import require_role, require_verified_email
from ..geospatial import haversine_distance_km
from ..fcm import fcm_service
from ..notifications_helper import build_assistance_response

router = APIRouter(prefix="/api/volunteer", tags=["Volunteer"])


@router.put("/availability")
def update_availability(
    data: VolunteerAvailabilityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER))
):
    if data.is_available:
        require_verified_email(current_user)
    profile = current_user.volunteer_profile
    if not profile:
        profile = VolunteerProfile(user_id=current_user.id, is_verified=current_user.is_verified)
        db.add(profile)

    profile.is_available = data.is_available
    # Live location sharing is ONLY active while On duty: clear active coordinates when going Off duty
    if not data.is_available:
        profile.share_location_consent = False
    else:
        profile.share_location_consent = True

    db.commit()
    db.refresh(profile)

    return {
        "status": "success",
        "is_available": profile.is_available,
        "duty_state": "on_duty" if profile.is_available else "off_duty",
        "message": (
            "You are On Duty. Live location sharing and nearby assistance alerts are enabled."
            if profile.is_available
            else "You are Off Duty. Live location sharing has stopped and alerts are paused."
        ),
    }


@router.put("/location")
def update_location(
    data: VolunteerLocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER))
):
    require_verified_email(current_user)
    profile = current_user.volunteer_profile
    if not profile:
        profile = VolunteerProfile(user_id=current_user.id, is_verified=current_user.is_verified)
        db.add(profile)

    if not profile.is_available:
        raise HTTPException(
            status_code=403,
            detail="Live location sharing is only allowed while On Duty."
        )

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
        "updated_at": profile.last_location_updated_at.isoformat(),
    }


@router.post("/verify")
def verify_volunteer_identity(
    data: VolunteerVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER))
):
    require_verified_email(current_user)
    profile = current_user.volunteer_profile
    if not profile:
        profile = VolunteerProfile(user_id=current_user.id)
        db.add(profile)

    if data.verification_method == "phone":
        if not data.phone_number or not data.otp_code:
            raise HTTPException(status_code=400, detail="Phone number and OTP code are required.")
        otp_rec = (
            db.query(OTPVerification)
            .filter(OTPVerification.phone_number == data.phone_number.strip())
            .order_by(OTPVerification.created_at.desc())
            .first()
        )
        if not otp_rec or otp_rec.code != data.otp_code.strip():
            raise HTTPException(status_code=400, detail="Invalid OTP code.")
        otp_rec.verified = True
        current_user.phone_number = data.phone_number.strip()
        current_user.phone_verified = True
        current_user.verification_method = "phone"
        current_user.verification_reference = f"***{data.phone_number.strip()[-4:]}"
    else:
        id_val = (data.id_number or "").strip()
        if len(id_val) < 6:
            raise HTTPException(status_code=400, detail="ID number must be at least 6 characters.")
        current_user.verification_method = "id"
        current_user.verification_reference = f"ID-***{id_val[-4:]}"

    current_user.is_verified = True
    profile.is_verified = True
    db.commit()
    return {
        "status": "verified",
        "is_verified": True,
        "verification_method": current_user.verification_method,
        "verification_reference": current_user.verification_reference,
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

    declined_ids = {
        d.request_id
        for d in db.query(RequestDecline).filter(RequestDecline.volunteer_id == current_user.id).all()
    }
    blocked_user_ids = {
        b.blocked_user_id
        for b in db.query(UserBlock).filter(UserBlock.blocker_id == current_user.id).all()
    } | {
        b.blocker_id
        for b in db.query(UserBlock).filter(UserBlock.blocked_user_id == current_user.id).all()
    }

    pending = db.query(AssistanceRequest).filter(
        AssistanceRequest.status == RequestStatus.PENDING
    ).all()

    nearby_list = []
    for req in pending:
        if req.id in declined_ids or req.blind_user_id in blocked_user_ids:
            continue
        dist_km = haversine_distance_km(req.latitude, req.longitude, v_lat, v_lon)
        # Match within active request radius, or up to 50 km (Bangalore metropolitan area) for on-duty standby volunteers
        if dist_km <= max(req.radius_km, 50.0):
            nearby_list.append(
                build_assistance_response(
                    req,
                    fuzz_location=True,
                    viewer_lat=v_lat,
                    viewer_lng=v_lon,
                )
            )

    return nearby_list


@router.get("/history", response_model=List[AssistanceRequestResponse])
def get_volunteer_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.VOLUNTEER))
):
    rows = (
        db.query(AssistanceRequest)
        .filter(AssistanceRequest.accepted_by_id == current_user.id)
        .order_by(AssistanceRequest.created_at.desc())
        .limit(50)
        .all()
    )
    return [build_assistance_response(r, fuzz_location=False) for r in rows]


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
        "is_verified": bool(current_user.is_verified or (profile and profile.is_verified)),
        "email_verified": bool(getattr(current_user, "email_verified", False)),
        "verification_method": current_user.verification_method,
        "avg_rating": round(profile.avg_rating, 2) if profile else 5.0,
        "rating_count": profile.rating_count if profile else 0,
        "completed_count": profile.completed_count if profile else 0,
        "has_location": bool(profile and profile.last_latitude is not None),
        "last_latitude": profile.last_latitude if (profile and profile.is_available) else None,
        "last_longitude": profile.last_longitude if (profile and profile.is_available) else None,
        "fcm_status": fcm_status,
    }
