import uuid
from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Enum as SQLEnum, Text
)
from sqlalchemy.orm import relationship
from .database import Base

class UserRole(str, Enum):
    BLIND_USER = "blind_user"
    VOLUNTEER = "volunteer"

class RequestStatus(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(64), unique=True, index=True, nullable=False)
    email = Column(String(128), unique=True, index=True, nullable=True)
    hashed_password = Column(String(128), nullable=False)
    full_name = Column(String(128), nullable=False)
    phone_number = Column(String(32), nullable=True)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.BLIND_USER)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    volunteer_profile = relationship("VolunteerProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    assistance_requests = relationship("AssistanceRequest", foreign_keys="AssistanceRequest.blind_user_id", back_populates="blind_user")
    accepted_requests = relationship("AssistanceRequest", foreign_keys="AssistanceRequest.accepted_by_id", back_populates="accepted_volunteer")

class VolunteerProfile(Base):
    __tablename__ = "volunteer_profiles"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    # Availability toggle explicitly enabled by volunteer
    is_available = Column(Boolean, default=False, nullable=False)
    
    # Location coordinates with explicit consent
    last_latitude = Column(Float, nullable=True)
    last_longitude = Column(Float, nullable=True)
    last_location_updated_at = Column(DateTime, nullable=True)
    
    # Consent flag to share location with matched blind users
    share_location_consent = Column(Boolean, default=True, nullable=False)
    
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
    
    assistance_type = Column(String(64), default="General Assistance", nullable=False)
    notes = Column(Text, nullable=True)
    radius_km = Column(Float, default=1.0, nullable=False)
    
    # Volunteer who claimed this request (Atomic claim)
    accepted_by_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    accepted_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancellation_reason = Column(String(256), nullable=True)

    blind_user = relationship("User", foreign_keys=[blind_user_id], back_populates="assistance_requests")
    accepted_volunteer = relationship("User", foreign_keys=[accepted_by_id], back_populates="accepted_requests")
