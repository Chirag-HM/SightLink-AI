import uuid
from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Enum as SQLEnum, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship
from .database import Base


class UserRole(str, Enum):
    BLIND_USER = "blind_user"
    VOLUNTEER = "volunteer"
    FAMILY = "family"


class RequestStatus(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    ARRIVED = "ARRIVED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class LiveAssistStatus(str, Enum):
    WAITING = "waiting"
    CONNECTED = "connected"
    ESCALATED = "escalated"
    ENDED = "ended"


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(64), unique=True, index=True, nullable=False)
    email = Column(String(128), unique=True, index=True, nullable=True)
    hashed_password = Column(String(128), nullable=False)
    full_name = Column(String(128), nullable=False)
    phone_number = Column(String(32), nullable=True)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.BLIND_USER)

    # Verification & safety flags
    email_verified = Column(Boolean, default=False, nullable=False)
    auth_provider = Column(String(24), default="local", nullable=False)  # "local" | "google"
    google_sub = Column(String(128), unique=True, index=True, nullable=True)
    photo_url = Column(Text, nullable=True)
    needs_role_selection = Column(Boolean, default=False, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    phone_verified = Column(Boolean, default=False, nullable=False)
    verification_method = Column(String(32), nullable=True)  # "phone" | "id"
    verification_reference = Column(String(64), nullable=True)  # masked phone/ID ref
    is_suspended = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    volunteer_profile = relationship("VolunteerProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    assistance_requests = relationship("AssistanceRequest", foreign_keys="AssistanceRequest.blind_user_id", back_populates="blind_user")
    accepted_requests = relationship("AssistanceRequest", foreign_keys="AssistanceRequest.accepted_by_id", back_populates="accepted_volunteer")
    family_share_session = relationship("FamilyShareSession", back_populates="blind_user", uselist=False, cascade="all, delete-orphan")
    telegram_link = relationship("TelegramLink", back_populates="user", uselist=False, cascade="all, delete-orphan")
    connected_devices = relationship("ConnectedDevice", back_populates="user", cascade="all, delete-orphan")
    health_records = relationship("HealthRecord", back_populates="user", cascade="all, delete-orphan")
    health_summaries = relationship("HealthDailySummary", back_populates="user", cascade="all, delete-orphan")


class VolunteerProfile(Base):
    __tablename__ = "volunteer_profiles"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Availability toggle explicitly enabled by volunteer (On duty / Off duty)
    is_available = Column(Boolean, default=False, nullable=False)

    # Location coordinates with explicit consent — only updated while On duty
    last_latitude = Column(Float, nullable=True)
    last_longitude = Column(Float, nullable=True)
    last_location_updated_at = Column(DateTime, nullable=True)

    # Consent flag to share location with matched blind users
    share_location_consent = Column(Boolean, default=True, nullable=False)

    # Verification & Ratings
    is_verified = Column(Boolean, default=False, nullable=False)
    avg_rating = Column(Float, default=5.0, nullable=False)
    rating_count = Column(Integer, default=0, nullable=False)
    completed_count = Column(Integer, default=0, nullable=False)

    # Optional FCM token for web background push
    fcm_token = Column(String(256), nullable=True)

    user = relationship("User", back_populates="volunteer_profile")


class AssistanceRequest(Base):
    __tablename__ = "assistance_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    blind_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)

    status = Column(SQLEnum(RequestStatus), default=RequestStatus.PENDING, index=True, nullable=False)

    # Latest valid GPS coordinates from ESP8266 or device
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)

    assistance_type = Column(String(64), default="crossing_road", nullable=False)
    notes = Column(Text, nullable=True)
    radius_km = Column(Float, default=0.5, nullable=False)

    # Escalation stage: 0 = 500m, 1 = 1km, 2 = 3km, 3 = family alerted & SOS offered
    escalation_stage = Column(Integer, default=0, nullable=False)
    last_escalated_at = Column(DateTime, nullable=True)
    no_volunteer_alerted_at = Column(DateTime, nullable=True)

    # Volunteer who claimed this request (Atomic claim)
    accepted_by_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)

    # Rating after completion
    rating = Column(Integer, nullable=True)
    rating_comment = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    accepted_at = Column(DateTime, nullable=True)
    arrived_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancellation_reason = Column(String(256), nullable=True)

    blind_user = relationship("User", foreign_keys=[blind_user_id], back_populates="assistance_requests")
    accepted_volunteer = relationship("User", foreign_keys=[accepted_by_id], back_populates="accepted_requests")


class RequestDecline(Base):
    __tablename__ = "request_declines"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    request_id = Column(String(36), ForeignKey("assistance_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    volunteer_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class FamilyShareSession(Base):
    __tablename__ = "family_share_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    blind_user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    invite_code = Column(String(32), unique=True, index=True, nullable=False)

    consent_given = Column(Boolean, default=False, nullable=False)
    is_sharing = Column(Boolean, default=False, nullable=False)
    is_paused = Column(Boolean, default=False, nullable=False)

    # Saved safe zone geofence
    safe_zone_name = Column(String(128), nullable=True, default="Home Safe Zone")
    safe_zone_lat = Column(Float, nullable=True)
    safe_zone_lng = Column(Float, nullable=True)
    safe_zone_radius_m = Column(Float, nullable=True, default=250.0)
    was_inside_safe_zone = Column(Boolean, default=True, nullable=False)
    last_geofence_alert_at = Column(DateTime, nullable=True)

    # Latest telemetry (encrypted at rest when populated; legacy float fields redacted for encrypted rows)
    last_latitude = Column(Float, nullable=True)
    last_longitude = Column(Float, nullable=True)
    encrypted_last_coords = Column(Text, nullable=True)
    last_place_name = Column(String(128), nullable=True)
    battery_level = Column(Integer, nullable=True)
    last_seen_at = Column(DateTime, nullable=True)
    sos_active = Column(Boolean, default=False, nullable=False)
    sos_triggered_at = Column(DateTime, nullable=True)

    # Calm family controls: 1-hour pause, quiet hours, caregiver indicator, 7-day retention
    paused_until = Column(DateTime, nullable=True)
    quiet_hours_enabled = Column(Boolean, default=False, nullable=False)
    quiet_hours_start = Column(String(8), default="22:00", nullable=True)
    quiet_hours_end = Column(String(8), default="07:00", nullable=True)
    quiet_hours_tz_offset_min = Column(Integer, default=0, nullable=False)
    caregiver_managed = Column(Boolean, default=False, nullable=False)
    caregiver_name = Column(String(128), nullable=True)
    raw_retention_days = Column(Integer, default=7, nullable=False)

    # Unfamiliar long-stop tracker
    stopped_anchor_enc = Column(Text, nullable=True)
    stopped_anchor_since = Column(DateTime, nullable=True)
    long_stop_alerted = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    blind_user = relationship("User", back_populates="family_share_session")


class FamilyLink(Base):
    __tablename__ = "family_links"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    family_user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    blind_user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    invite_code = Column(String(32), nullable=False)
    relationship_label = Column(String(64), default="Guardian", nullable=False)

    # Confirmation workflow & granular per-member sharing permissions
    status = Column(String(32), default="approved", nullable=False)  # pending_confirmation | approved | declined
    share_arrival_departure = Column(Boolean, default=True, nullable=False)
    share_help_requests = Column(Boolean, default=True, nullable=False)
    share_unusual_route = Column(Boolean, default=True, nullable=False)
    share_live_map = Column(Boolean, default=True, nullable=False)
    confirmed_at = Column(DateTime, nullable=True)

    # Multi-channel & event alert preferences chosen per family member
    notify_email = Column(Boolean, default=True, nullable=False)
    notify_telegram = Column(Boolean, default=True, nullable=False)
    notify_web_push = Column(Boolean, default=True, nullable=False)
    receive_sos = Column(Boolean, default=True, nullable=False)
    receive_no_volunteer = Column(Boolean, default=True, nullable=False)
    receive_volunteer_accepted = Column(Boolean, default=True, nullable=False)
    receive_help_completed = Column(Boolean, default=True, nullable=False)
    receive_place_arrival = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class LocationBreadcrumb(Base):
    __tablename__ = "location_breadcrumbs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    latitude = Column(Float, nullable=False, default=0.0)
    longitude = Column(Float, nullable=False, default=0.0)
    encrypted_coords = Column(Text, nullable=True)
    accuracy = Column(Float, nullable=True)
    battery_level = Column(Integer, nullable=True)
    inside_safe_zone = Column(Boolean, nullable=True)
    recorded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    role = Column(String(32), nullable=False, default="volunteer")
    invite_code = Column(String(32), nullable=True, index=True)
    endpoint = Column(Text, nullable=False)
    p256dh = Column(Text, nullable=True)
    auth = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class UserReport(Base):
    __tablename__ = "user_reports"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    reporter_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reported_user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    request_id = Column(String(36), nullable=True)
    reason = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class UserBlock(Base):
    __tablename__ = "user_blocks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    blocker_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    blocked_user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SOSAlert(Base):
    __tablename__ = "sos_alerts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    source = Column(String(64), default="web_ui", nullable=False)
    notes = Column(Text, nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    resolved_at = Column(DateTime, nullable=True)


class OTPVerification(Base):
    __tablename__ = "otp_verifications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    phone_number = Column(String(32), index=True, nullable=False)
    code = Column(String(12), nullable=False)
    verified = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class LiveAssistSession(Base):
    __tablename__ = "live_assist_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    blind_user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(SQLEnum(LiveAssistStatus), default=LiveAssistStatus.WAITING, nullable=False, index=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    duration_sec = Column(Integer, default=30, nullable=False)
    outcome = Column(String(64), nullable=True)  # completed | escalated | timeout_fallback | cancelled | poor_connection

    radius_km = Column(Float, default=1.0, nullable=False)
    escalation_stage = Column(Integer, default=0, nullable=False)  # 0=1km, 1=3km, 2=10km+remote, 3=45s family+SOS
    last_escalated_at = Column(DateTime, nullable=True)
    allow_remote = Column(Boolean, default=True, nullable=False)

    accepted_by_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    accepted_at = Column(DateTime, nullable=True)
    connected_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)

    connection_mode = Column(String(24), default="video", nullable=False)  # video | audio_only
    flash_requested = Column(Boolean, default=False, nullable=False)
    consent_confirmed = Column(Boolean, default=False, nullable=False)
    recording_enabled = Column(Boolean, default=False, nullable=False)
    escalated_request_id = Column(String(36), ForeignKey("assistance_requests.id"), nullable=True)

    rating = Column(Integer, nullable=True)
    rating_comment = Column(Text, nullable=True)

    blind_user = relationship("User", foreign_keys=[blind_user_id])
    accepted_volunteer = relationship("User", foreign_keys=[accepted_by_id])


class LiveAssistDecline(Base):
    __tablename__ = "live_assist_declines"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("live_assist_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    volunteer_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SavedPlace(Base):
    __tablename__ = "saved_places"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    category = Column(String(48), default="custom", nullable=False)  # home | clinic | work | market | custom
    encrypted_coords = Column(Text, nullable=False)
    radius_m = Column(Float, default=200.0, nullable=False)
    is_currently_inside = Column(Boolean, default=False, nullable=False)
    last_entered_at = Column(DateTime, nullable=True)
    last_exited_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class FamilyEvent(Base):
    __tablename__ = "family_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    blind_user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    category = Column(String(48), nullable=False, index=True)  # arrival_departure | help_request | unusual_route | long_stop | sos | system
    title = Column(String(160), nullable=False)
    summary = Column(Text, nullable=False)
    place_name = Column(String(128), nullable=True)
    urgent = Column(Boolean, default=False, nullable=False)
    grouped_count = Column(Integer, default=1, nullable=False)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class UsualRoutePoint(Base):
    __tablename__ = "usual_route_points"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    grid_key = Column(String(64), nullable=False, index=True)
    encrypted_centroid = Column(Text, nullable=False)
    visit_count = Column(Integer, default=1, nullable=False)
    last_seen_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class PendingRegistration(Base):
    __tablename__ = "pending_registrations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(64), index=True, nullable=False)
    email = Column(String(128), unique=True, index=True, nullable=False)
    hashed_password = Column(String(128), nullable=False)
    full_name = Column(String(128), nullable=False)
    phone_number = Column(String(32), nullable=True)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.BLIND_USER)

    is_verified = Column(Boolean, default=False, nullable=False)
    phone_verified = Column(Boolean, default=False, nullable=False)
    verification_method = Column(String(32), nullable=True)
    verification_reference = Column(String(64), nullable=True)
    invite_code = Column(String(64), nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class EmailVerificationCode(Base):
    __tablename__ = "email_verification_codes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    pending_id = Column(String(36), ForeignKey("pending_registrations.id", ondelete="CASCADE"), nullable=True, index=True)
    email = Column(String(128), nullable=False, index=True)
    code_salt = Column(String(64), nullable=False)
    code_hash = Column(String(128), nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    max_attempts = Column(Integer, default=5, nullable=False)
    locked = Column(Boolean, default=False, nullable=False)
    consumed = Column(Boolean, default=False, nullable=False)
    invalidated = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class TelegramLink(Base):
    __tablename__ = "telegram_links"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    connect_token = Column(String(64), unique=True, index=True, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    token_used = Column(Boolean, default=False, nullable=False)
    chat_id = Column(String(64), nullable=True, index=True)
    telegram_username = Column(String(128), nullable=True)
    is_active = Column(Boolean, default=False, nullable=False)
    connected_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="telegram_link")


class NotificationDeliveryLog(Base):
    __tablename__ = "notification_delivery_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    blind_user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    dedup_key = Column(String(160), nullable=False, index=True)
    channel = Column(String(24), nullable=False, index=True)  # email | telegram | web_push
    destination_masked = Column(String(128), nullable=True)
    status = Column(String(24), nullable=False, index=True)  # sent | failed | skipped
    attempt_count = Column(Integer, default=1, nullable=False)
    error_detail = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class RateLimitEntry(Base):
    __tablename__ = "rate_limit_entries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    bucket_key = Column(String(160), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class AssistantCommandLog(Base):
    __tablename__ = "assistant_command_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    client_id = Column(String(64), nullable=True, index=True)
    transcript = Column(Text, nullable=False)
    intent = Column(String(64), nullable=False, index=True)
    result = Column(Text, nullable=False)
    status = Column(String(24), default="success", nullable=False)
    source = Column(String(32), default="voice", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class ConnectedDevice(Base):
    __tablename__ = "connected_devices"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device_name = Column(String(128), nullable=False)
    device_model = Column(String(128), nullable=True)
    os_version = Column(String(32), nullable=True)
    app_version = Column(String(32), nullable=True)
    device_token = Column(String(128), unique=True, index=True, nullable=False)
    pairing_code = Column(String(16), unique=True, index=True, nullable=True)
    pairing_code_expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    last_synced_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="connected_devices")
    health_records = relationship("HealthRecord", back_populates="device")
    consents = relationship("HealthConsent", back_populates="device", cascade="all, delete-orphan")


class HealthConsent(Base):
    __tablename__ = "health_consents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(String(36), ForeignKey("connected_devices.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_name = Column(String(64), nullable=False, index=True)  # Steps, HeartRate, SleepSession, etc.
    granted = Column(Boolean, default=True, nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    device = relationship("ConnectedDevice", back_populates="consents")

    __table_args__ = (
        UniqueConstraint("device_id", "permission_name", name="uq_device_permission"),
    )


class HealthRecord(Base):
    __tablename__ = "health_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(String(36), ForeignKey("connected_devices.id", ondelete="SET NULL"), nullable=True, index=True)
    record_type = Column(String(48), nullable=False, index=True)  # steps, heart_rate, resting_heart_rate, sleep_session, etc.
    client_record_id = Column(String(128), nullable=False, index=True)
    start_time = Column(DateTime, nullable=True, index=True)
    end_time = Column(DateTime, nullable=True, index=True)
    value_num = Column(Float, nullable=True)
    secondary_value_num = Column(Float, nullable=True)  # diastolic mmHg
    unit = Column(String(24), nullable=False)
    data_source = Column(String(128), nullable=True)  # package name / wearable
    metadata_json = Column(Text, nullable=True)
    synced_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship("User", back_populates="health_records")
    device = relationship("ConnectedDevice", back_populates="health_records")

    __table_args__ = (
        UniqueConstraint("user_id", "client_record_id", name="uq_user_client_record"),
    )


class HealthDailySummary(Base):
    __tablename__ = "health_daily_summaries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    steps = Column(Integer, nullable=True)
    active_calories = Column(Float, nullable=True)
    total_calories = Column(Float, nullable=True)
    distance_meters = Column(Float, nullable=True)
    avg_heart_rate = Column(Float, nullable=True)
    min_heart_rate = Column(Float, nullable=True)
    max_heart_rate = Column(Float, nullable=True)
    resting_heart_rate = Column(Float, nullable=True)
    sleep_duration_minutes = Column(Integer, nullable=True)
    sleep_stages_json = Column(Text, nullable=True)
    spo2_avg = Column(Float, nullable=True)
    systolic_avg = Column(Float, nullable=True)
    diastolic_avg = Column(Float, nullable=True)
    exercise_duration_minutes = Column(Integer, nullable=True)
    last_synced_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="health_summaries")

    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_user_summary_date"),
    )


class HealthSyncHistory(Base):
    __tablename__ = "health_sync_history"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(String(36), ForeignKey("connected_devices.id", ondelete="SET NULL"), nullable=True, index=True)
    synced_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    records_received = Column(Integer, default=0, nullable=False)
    records_inserted = Column(Integer, default=0, nullable=False)
    status = Column(String(24), default="success", nullable=False)
    error_detail = Column(Text, nullable=True)
