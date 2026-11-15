import os
import secrets
from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings

try:
    from dotenv import load_dotenv
    _ROOT_DIR = Path(__file__).resolve().parents[3]
    _MODULE_DIR = Path(__file__).resolve().parents[1]
    load_dotenv(_ROOT_DIR / ".env")
    load_dotenv(_MODULE_DIR / ".env")
except Exception:
    pass

_DEFAULT_DB_PATH = (Path(__file__).resolve().parents[2] / "volunteer_assistance.db").as_posix()


class Settings(BaseSettings):
    PROJECT_NAME: str = "SightLink AI — Smart Blind Stick & Volunteer Assistance API"
    SECRET_KEY: str = os.getenv("JWT_SECRET_KEY") or secrets.token_urlsafe(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Google Sign-In & Session Cookie Security
    GOOGLE_CLIENT_ID: str | None = os.getenv("GOOGLE_CLIENT_ID", None)
    COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "false").strip().lower() in ("1", "true", "yes")
    COOKIE_DOMAIN: str | None = os.getenv("COOKIE_DOMAIN") or None
    APP_PUBLIC_URL: str = os.getenv("APP_PUBLIC_URL", "http://localhost:5173").rstrip("/")

    # Gmail SMTP Sending (App Password) & Verification Policy
    GMAIL_USER: str | None = os.getenv("GMAIL_USER", None)
    GMAIL_APP_PASSWORD: str | None = os.getenv("GMAIL_APP_PASSWORD", None)
    GMAIL_FROM_NAME: str = os.getenv("GMAIL_FROM_NAME", "SightLink AI")
    EMAIL_OTP_EXPIRE_MINUTES: int = int(os.getenv("EMAIL_OTP_EXPIRE_MINUTES", "10"))
    EMAIL_OTP_MAX_ATTEMPTS: int = int(os.getenv("EMAIL_OTP_MAX_ATTEMPTS", "5"))
    EMAIL_OTP_COOLDOWN_SECONDS: int = int(os.getenv("EMAIL_OTP_COOLDOWN_SECONDS", "60"))
    EMAIL_OTP_DAILY_CAP: int = int(os.getenv("EMAIL_OTP_DAILY_CAP", "10"))

    # Free Telegram Bot (@BotFather)
    TELEGRAM_BOT_TOKEN: str | None = os.getenv("TELEGRAM_BOT_TOKEN", None)
    TELEGRAM_BOT_USERNAME: str | None = os.getenv("TELEGRAM_BOT_USERNAME", None)
    TELEGRAM_WEBHOOK_SECRET: str | None = os.getenv("TELEGRAM_WEBHOOK_SECRET", None)
    TELEGRAM_USE_POLLING: bool = os.getenv("TELEGRAM_USE_POLLING", "false").strip().lower() in ("1", "true", "yes")

    # Geospatial & Escalation Thresholds
    DEFAULT_SEARCH_RADIUS_KM: float = float(os.getenv("DEFAULT_SEARCH_RADIUS_KM", "0.5"))
    ESCALATION_STEP_SECONDS: int = int(os.getenv("ESCALATION_STEP_SECONDS", "60"))
    REQUEST_TIMEOUT_SECONDS: int = int(os.getenv("REQUEST_TIMEOUT_SECONDS", "300"))

    # Anti-Abuse & SOS/Alert Rate Limiting
    RATE_LIMIT_MAX_REQUESTS: int = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "5"))
    RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "600"))
    SOS_RATE_LIMIT_MAX: int = int(os.getenv("SOS_RATE_LIMIT_MAX", "5"))
    SOS_RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("SOS_RATE_LIMIT_WINDOW_SECONDS", "300"))

    # ESP8266 Stick Gateway & ESP32-CAM
    ESP8266_IP: str = os.getenv("ESP8266_IP", "10.235.17.89")
    ESP8266_TIMEOUT_SECONDS: float = 3.0
    ESP32_CAM_IP: str = os.getenv("ESP32_CAM_IP", "10.235.17.135").strip()
    ESP32_CAM_URL: str = (
        os.getenv("ESP32_CAM_URL", "").strip()
        or f"http://{os.getenv('ESP32_CAM_IP', '10.235.17.135').strip()}/capture"
    )
    ESP32_CAM_TIMEOUT_SECONDS: float = float(os.getenv("ESP32_CAM_TIMEOUT_SECONDS", "3.0"))

    # Firebase Cloud Messaging (FCM) Web Push Configuration
    FCM_SERVER_KEY: str | None = os.getenv("FCM_SERVER_KEY", None)
    FCM_PROJECT_ID: str | None = os.getenv("FCM_PROJECT_ID", None)

    # Web Push VAPID Keys (placeholders via environment variables)
    VAPID_PUBLIC_KEY: str | None = os.getenv("VAPID_PUBLIC_KEY", None)
    VAPID_PRIVATE_KEY: str | None = os.getenv("VAPID_PRIVATE_KEY", None)
    VAPID_SUBJECT: str = os.getenv("VAPID_SUBJECT", "mailto:alerts@sightlink.example")

    # Map Provider Placeholders
    MAPBOX_ACCESS_TOKEN: str | None = os.getenv("MAPBOX_ACCESS_TOKEN", None)
    GOOGLE_MAPS_API_KEY: str | None = os.getenv("GOOGLE_MAPS_API_KEY", None)

    # Voice Assistant: Free Geocoding, Routing, Bus Feeds & Optional LLM / Cloud Speech
    GEOCODER_PROVIDER: str = os.getenv("GEOCODER_PROVIDER", "nominatim").strip().lower()
    NOMINATIM_URL: str = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org").rstrip("/")
    PHOTON_URL: str = os.getenv("PHOTON_URL", "https://photon.komoot.io/api").rstrip("/")
    ROUTING_PROVIDER: str = os.getenv("ROUTING_PROVIDER", "osrm").strip().lower()
    OSRM_BASE_URL: str = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org/route/v1/foot").rstrip("/")
    ORS_API_KEY: str | None = os.getenv("ORS_API_KEY", None)
    ORS_BASE_URL: str = os.getenv("ORS_BASE_URL", "https://api.openrouteservice.org/v2/directions/foot-walking").rstrip("/")

    BUS_PROVIDER_MODE: str = os.getenv("BUS_PROVIDER_MODE", "auto").strip().lower()
    BUS_MOCK_ENABLED: bool = os.getenv("BUS_MOCK_ENABLED", "true").strip().lower() in ("1", "true", "yes")
    MOCK_BUS_DATA_PATH: str | None = os.getenv("MOCK_BUS_DATA_PATH", None)
    GTFS_CITY_NAME: str = os.getenv("GTFS_CITY_NAME", "Bengaluru")
    GTFS_STATIC_ZIP_URL: str | None = os.getenv("GTFS_STATIC_ZIP_URL", None)
    GTFS_STATIC_DIR: str | None = os.getenv("GTFS_STATIC_DIR", None)
    GTFS_RT_VEHICLE_POSITIONS_URL: str | None = os.getenv("GTFS_RT_VEHICLE_POSITIONS_URL", None)
    GTFS_RT_TRIP_UPDATES_URL: str | None = os.getenv("GTFS_RT_TRIP_UPDATES_URL", None)
    GTFS_API_KEY: str | None = os.getenv("GTFS_API_KEY", None)
    GTFS_API_KEY_HEADER: str = os.getenv("GTFS_API_KEY_HEADER", "Authorization")
    BUS_CACHE_TTL_SECONDS: int = int(os.getenv("BUS_CACHE_TTL_SECONDS", "30"))

    LLM_API_URL: str | None = os.getenv("LLM_API_URL", None)
    LLM_API_KEY: str | None = os.getenv("LLM_API_KEY", None)
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o-mini")

    CLOUD_STT_ENABLED: bool = os.getenv("CLOUD_STT_ENABLED", "false").strip().lower() in ("1", "true", "yes")
    CLOUD_TTS_ENABLED: bool = os.getenv("CLOUD_TTS_ENABLED", "false").strip().lower() in ("1", "true", "yes")
    HARDWARE_BUTTON_TOKEN: str | None = os.getenv("HARDWARE_BUTTON_TOKEN", None)

    # Eyes on Demand (Live Video Assistance)
    LIVE_ASSIST_DEFAULT_SECONDS: int = int(os.getenv("LIVE_ASSIST_DEFAULT_SECONDS", "30"))
    LIVE_ASSIST_ESCALATION_STEP_SECONDS: int = int(os.getenv("LIVE_ASSIST_ESCALATION_STEP_SECONDS", "15"))
    LIVE_ASSIST_NO_JOIN_FALLBACK_SECONDS: int = int(os.getenv("LIVE_ASSIST_NO_JOIN_FALLBACK_SECONDS", "45"))

    # Calm Family Updates, Location Encryption at Rest & Retention
    LOCATION_ENCRYPTION_KEY: str | None = os.getenv("LOCATION_ENCRYPTION_KEY", None)
    LOCATION_RETENTION_DAYS: int = int(os.getenv("LOCATION_RETENTION_DAYS", "7"))
    LONG_STOP_MINUTES: int = int(os.getenv("LONG_STOP_MINUTES", "10"))
    ALERT_GROUP_WINDOW_SECONDS: int = int(os.getenv("ALERT_GROUP_WINDOW_SECONDS", "300"))

    # Optional Free Webhook Notification Channels
    SMS_WEBHOOK_URL: str | None = os.getenv("SMS_WEBHOOK_URL", None)
    WHATSAPP_WEBHOOK_URL: str | None = os.getenv("WHATSAPP_WEBHOOK_URL", None)
    NTFY_TOPIC_URL: str | None = os.getenv("NTFY_TOPIC_URL", None)

    # Database (anchored to ESP32_CAM_Test/volunteer_assistance.db across entrypoints)
    DATABASE_URL: str = os.getenv("DATABASE_URL") or f"sqlite:///{_DEFAULT_DB_PATH}"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _fallback_database_url(cls, value):
        if not value or (isinstance(value, str) and not value.strip()):
            return f"sqlite:///{_DEFAULT_DB_PATH}"
        if isinstance(value, str):
            val = value.strip()
            if val.startswith("postgres://"):
                val = val.replace("postgres://", "postgresql://", 1)
            return val
        return value

    @field_validator("SECRET_KEY", mode="before")
    @classmethod
    def _fallback_secret_key(cls, value):
        if isinstance(value, str) and value.strip():
            return value.strip()
        return os.getenv("JWT_SECRET_KEY") or secrets.token_urlsafe(32)

    @field_validator("COOKIE_DOMAIN", mode="before")
    @classmethod
    def _blank_to_none(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value


settings = Settings()
