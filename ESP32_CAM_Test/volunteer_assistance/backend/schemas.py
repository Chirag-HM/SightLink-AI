from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from .models import UserRole, RequestStatus, LiveAssistStatus


# ── Auth & Verification Schemas ──────────────────────────────────────────────
class OTPRequest(BaseModel):
    phone_number: str = Field(..., min_length=6, max_length=32)


class OTPVerifyRequest(BaseModel):
    phone_number: str = Field(..., min_length=6, max_length=32)
    code: str = Field(..., min_length=4, max_length=12)


class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2, max_length=128)
    email: Optional[str] = None
    phone_number: Optional[str] = None
    role: UserRole = UserRole.BLIND_USER
    verification_method: Optional[str] = None  # "phone" | "id"
    verification_code: Optional[str] = None
    id_number: Optional[str] = None
    invite_code: Optional[str] = None  # optional for family role signup


class UserLoginRequest(BaseModel):
    username: str
    password: str


class VoiceLoginRequest(BaseModel):
    spoken_phrase: str
    username: Optional[str] = None
    passcode: Optional[str] = None


class GoogleLoginRequest(BaseModel):
    credential: str = Field(..., min_length=10)


class RoleSelectionRequest(BaseModel):
    role: UserRole
    phone_number: Optional[str] = None
    verification_method: Optional[str] = None  # "phone" | "id"
    verification_code: Optional[str] = None
    id_number: Optional[str] = None
    invite_code: Optional[str] = None


class EmailSendCodeRequest(BaseModel):
    email: Optional[str] = None


class EmailVerifyCodeRequest(BaseModel):
    email: Optional[str] = None
    code: str = Field(..., min_length=6, max_length=6)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: UserRole
    full_name: str
    email: Optional[str] = None
    photo_url: Optional[str] = None
    auth_provider: str = "local"
    is_verified: bool = False
    email_verified: bool = False
    emailVerified: bool = False
    needs_role_selection: bool = False
    verification_required: bool = False
    message: Optional[str] = None


class UserProfileResponse(BaseModel):
    id: str
    username: str
    full_name: str
    email: Optional[str] = None
    phone_number: Optional[str] = None
    photo_url: Optional[str] = None
    auth_provider: str = "local"
    role: UserRole
    is_available: Optional[bool] = None
    is_verified: bool = False
    email_verified: bool = False
    emailVerified: bool = False
    needs_role_selection: bool = False
    phone_verified: bool = False
    verification_method: Optional[str] = None
    avg_rating: Optional[float] = None
    rating_count: Optional[int] = None


class VolunteerVerifyRequest(BaseModel):
    verification_method: str = Field(..., pattern="^(phone|id)$")
    phone_number: Optional[str] = None
    otp_code: Optional[str] = None
    id_number: Optional[str] = None


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
    assistance_type: str = Field(default="crossing_road")
    notes: Optional[str] = None
    radius_km: float = Field(default=0.5, ge=0.2, le=10.0)


class ExpandRadiusRequest(BaseModel):
    new_radius_km: float = Field(..., ge=0.5, le=15.0)


class CancelAssistanceRequest(BaseModel):
    reason: Optional[str] = "Cancelled by user"


class RateAssistanceRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


class BlindUserLocationUpdate(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)


class VolunteerPublicInfo(BaseModel):
    id: str
    full_name: str
    phone_number: Optional[str] = None
    is_verified: bool = False
    avg_rating: float = 5.0
    rating_count: int = 0
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    eta_minutes: Optional[int] = None
    approx_distance_km: Optional[float] = None
    approx_distance_text: Optional[str] = None


class AssistanceRequestResponse(BaseModel):
    id: str
    userId: str
    blind_user_id: str
    blind_user_name: Optional[str] = None
    status: RequestStatus
    type: str
    assistance_type: str
    notes: Optional[str] = None
    radius_km: float
    escalation_stage: int = 0
    createdAt: datetime
    created_at: datetime
    accepted_at: Optional[datetime] = None
    arrived_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    rating: Optional[int] = None
    rating_comment: Optional[str] = None
    accepted_volunteer: Optional[VolunteerPublicInfo] = None

    # Locations: Fuzzed or request-scoped
    lat: float
    lng: float
    latitude: float
    longitude: float
    approx_distance_km: Optional[float] = None
    approx_distance_text: Optional[str] = None
    eta_minutes: Optional[int] = None


class NearbyVolunteersStatus(BaseModel):
    id: Optional[str] = None
    userId: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    type: Optional[str] = None
    createdAt: Optional[datetime] = None
    request_id: str
    status: RequestStatus
    volunteers_notified_count: int
    radius_km: float
    escalation_stage: int = 0
    message: str


# ── Family Live Tracking, Saved Places & Calm Family Schemas ────────────────
class FamilyConsentUpdate(BaseModel):
    consent_given: bool
    is_sharing: bool
    is_paused: bool = False
    pause_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    regenerate_code: bool = False
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    quiet_hours_end: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    quiet_hours_tz_offset_min: Optional[int] = Field(default=None, ge=-720, le=840)
    caregiver_managed: Optional[bool] = None
    caregiver_name: Optional[str] = Field(default=None, max_length=128)


class SafeZoneUpdate(BaseModel):
    safe_zone_name: str = Field(default="Home Safe Zone", min_length=2, max_length=128)
    safe_zone_lat: float = Field(..., ge=-90.0, le=90.0)
    safe_zone_lng: float = Field(..., ge=-180.0, le=180.0)
    safe_zone_radius_m: float = Field(default=250.0, ge=50.0, le=5000.0)


class FamilyTelemetryUpdate(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    accuracy: Optional[float] = None
    battery_level: Optional[int] = Field(default=None, ge=0, le=100)
    fall_detected: bool = False


class FamilyLinkRequest(BaseModel):
    invite_code: str = Field(..., min_length=4, max_length=32)
    relationship_label: str = Field(default="Guardian", max_length=64)
    require_user_confirmation: bool = False


class FamilyMemberConfirmRequest(BaseModel):
    approved: bool


class FamilyMemberPermissionsUpdate(BaseModel):
    share_arrival_departure: Optional[bool] = None
    share_help_requests: Optional[bool] = None
    share_unusual_route: Optional[bool] = None
    share_live_map: Optional[bool] = None
    arrival_departure_only: Optional[bool] = None
    relationship_label: Optional[str] = Field(default=None, max_length=64)
    notify_email: Optional[bool] = None
    notify_telegram: Optional[bool] = None
    notify_web_push: Optional[bool] = None
    receive_sos: Optional[bool] = None
    receive_no_volunteer: Optional[bool] = None
    receive_volunteer_accepted: Optional[bool] = None
    receive_help_completed: Optional[bool] = None
    receive_place_arrival: Optional[bool] = None


class FamilyMemberChannelPreferencesUpdate(BaseModel):
    notify_email: Optional[bool] = None
    notify_telegram: Optional[bool] = None
    notify_web_push: Optional[bool] = None
    receive_sos: Optional[bool] = None
    receive_no_volunteer: Optional[bool] = None
    receive_volunteer_accepted: Optional[bool] = None
    receive_help_completed: Optional[bool] = None
    receive_place_arrival: Optional[bool] = None


class SavedPlaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    category: str = Field(default="custom", max_length=48)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    radius_m: float = Field(default=200.0, ge=50.0, le=5000.0)


# ── Eyes on Demand (Live Video Assist) Schemas ───────────────────────────────
class CreateLiveAssistRequest(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    consent_confirmed: bool = False
    allow_remote: bool = True


class ExtendLiveAssistRequest(BaseModel):
    extra_seconds: int = Field(default=30, ge=10, le=120)


class QuickReplyPromptRequest(BaseModel):
    prompt_text: str = Field(..., min_length=2, max_length=200)


class FlashToggleRequest(BaseModel):
    flash_on: bool


class AudioFallbackRequest(BaseModel):
    reason: Optional[str] = "Weak connection — switched to audio-only"


class EndLiveAssistRequest(BaseModel):
    outcome: str = Field(default="completed", max_length=64)


class RateLiveAssistRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=500)


class LiveAssistSessionResponse(BaseModel):
    id: str
    userId: str
    blind_user_id: str
    blind_user_name: Optional[str] = None
    status: LiveAssistStatus
    lat: float
    lng: float
    createdAt: datetime
    created_at: datetime
    durationSec: int
    duration_sec: int
    remaining_sec: int = 0
    outcome: Optional[str] = None
    radius_km: float = 1.0
    escalation_stage: int = 0
    allow_remote: bool = True
    is_remote_match: bool = False
    connection_mode: str = "video"
    flash_requested: bool = False
    consent_confirmed: bool = False
    recording_enabled: bool = False
    escalated_request_id: Optional[str] = None
    accepted_volunteer: Optional[VolunteerPublicInfo] = None
    approx_distance_km: Optional[float] = None
    approx_distance_text: Optional[str] = None
    rating: Optional[int] = None
    rating_comment: Optional[str] = None
    expires_at: Optional[datetime] = None


# ── Safety, Report, Block & Push Schemas ─────────────────────────────────────
class SOSTriggerRequest(BaseModel):
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    battery_level: Optional[int] = Field(default=None, ge=0, le=100)
    source: str = "web_ui"
    notes: Optional[str] = None


class ReportUserRequest(BaseModel):
    reported_user_id: str
    request_id: Optional[str] = None
    reason: str = Field(..., min_length=3, max_length=500)
    block_user: bool = True


class PushSubscriptionRequest(BaseModel):
    endpoint: str
    p256dh: Optional[str] = None
    auth: Optional[str] = None
    role: str = "volunteer"
    invite_code: Optional[str] = None


# ── ESP8266 Stick GPS Sync Schema ─────────────────────────────────────────────
class StickGPSSync(BaseModel):
    fix: bool
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    satellites: int = 0
    distance_cm: Optional[float] = None
    button_pressed: Optional[bool] = None


# ── Voice Assistant, Hardware Button & Calm Navigation Schemas ────────────────
class AssistantCommandLogCreate(BaseModel):
    client_id: Optional[str] = Field(default=None, max_length=64)
    transcript: str = Field(..., min_length=1, max_length=1000)
    intent: str = Field(..., min_length=1, max_length=64)
    result: str = Field(..., min_length=1, max_length=2000)
    status: str = Field(default="success", max_length=24)
    source: str = Field(default="voice", max_length=32)


class AssistantCommandLogResponse(BaseModel):
    id: str
    transcript: str
    intent: str
    result: str
    status: str
    source: str
    created_at: datetime


class LLMIntentParseRequest(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=500)
    language: str = Field(default="en-IN", max_length=16)
    navigation_active: bool = False


class HardwareButtonEventRequest(BaseModel):
    action: str = Field(..., pattern="^(single_press|cancel|long_press|press_hold_sos|bus_assistant|bus_press)$")
    device_id: str = Field(default="esp32-voice-button", max_length=64)
    user_id: Optional[str] = Field(default=None, max_length=64)
    client_id: Optional[str] = Field(default=None, max_length=64)
    source: str = Field(default="esp32_ws", max_length=32)
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)


class FamilyCheckInAlertRequest(BaseModel):
    action_type: str = Field(default="send_location", pattern="^(call_family|send_location)$")
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    note: Optional[str] = Field(default=None, max_length=300)


class FamilyNavigationEventRequest(BaseModel):
    status: str = Field(..., pattern="^(started|arrived|rerouted|cancelled)$")
    destination_name: str = Field(..., min_length=1, max_length=200)
    distance_m: Optional[int] = Field(default=None, ge=0)
    eta_minutes: Optional[int] = Field(default=None, ge=0)
