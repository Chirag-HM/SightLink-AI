import os
import secrets
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Blind Stick - Nearby Volunteer Assistance API"
    SECRET_KEY: str = os.getenv("JWT_SECRET_KEY") or secrets.token_urlsafe(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    DEFAULT_SEARCH_RADIUS_KM: float = 1.0
    REQUEST_TIMEOUT_SECONDS: int = 300  # 5 minutes before unanswered request expires
    
    # ESP8266 Stick Gateway
    ESP8266_IP: str = os.getenv("ESP8266_IP", "10.173.66.89")
    ESP8266_TIMEOUT_SECONDS: float = 3.0
    
    # Firebase Cloud Messaging (FCM) Web Push Configuration
    # If not set, background FCM push is flagged as unconfigured (WebSockets remain active)
    FCM_SERVER_KEY: str | None = os.getenv("FCM_SERVER_KEY", None)
    FCM_PROJECT_ID: str | None = os.getenv("FCM_PROJECT_ID", None)

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./volunteer_assistance.db")

settings = Settings()
