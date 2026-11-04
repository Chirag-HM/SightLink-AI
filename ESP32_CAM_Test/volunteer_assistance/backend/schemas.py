from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from .models import UserRole, RequestStatus

# ── Auth Schemas ─────────────────────────────────────────────────────────────
class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2, max_length=128)
    email: Optional[str] = None
    phone_number: Optional[str] = None
    role: UserRole = UserRole.BLIND_USER

class UserLoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: UserRole
    full_name: str

class UserProfileResponse(BaseModel):
    id: str
    username: str
    full_name: str
    email: Optional[str] = None
    phone_number: Optional[str] = None
    role: UserRole
    is_available: Optional[bool] = None

# ── Volunteer Profile & Location Schemas ──────────────────────────────────────
class VolunteerAvailabilityUpdate(BaseModel):
    is_available: bool

class VolunteerLocationUpdate(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    share_consent: bool = True
    fcm_token: Optional[str] = None

# ── Assistance Request Schemas ───────────────────────────────────────────────
class CreateAssistanceRequest(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    assistance_type: str = Field(default="General Assistance")
    notes: Optional[str] = None
    radius_km: float = Field(default=1.0, ge=0.5, le=10.0)

class ExpandRadiusRequest(BaseModel):
    new_radius_km: float = Field(..., ge=1.0, le=15.0)

class CancelAssistanceRequest(BaseModel):
    reason: Optional[str] = "Cancelled by user"

class VolunteerPublicInfo(BaseModel):
    id: str
    full_name: str
    phone_number: Optional[str] = None
    approx_distance_km: Optional[float] = None
    approx_distance_text: Optional[str] = None

class AssistanceRequestResponse(BaseModel):
    id: str
    blind_user_id: str
    blind_user_name: Optional[str] = None
    status: RequestStatus
    assistance_type: str
    notes: Optional[str] = None
    radius_km: float
    created_at: datetime
    accepted_at: Optional[datetime] = None
    accepted_volunteer: Optional[VolunteerPublicInfo] = None
    
    # Locations: Fuzzed or request-scoped
    latitude: float
    longitude: float
    approx_distance_km: Optional[float] = None
    approx_distance_text: Optional[str] = None

class NearbyVolunteersStatus(BaseModel):
    request_id: str
    status: RequestStatus
    volunteers_notified_count: int
    radius_km: float
    message: str

# ── ESP8266 Stick GPS Sync Schema ─────────────────────────────────────────────
class StickGPSSync(BaseModel):
    fix: bool
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    satellites: int = 0
    distance_cm: Optional[float] = None
    button_pressed: Optional[bool] = None
