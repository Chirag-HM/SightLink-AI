import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Iterable, Optional

import requests
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

try:
    import jwt as _pyjwt
    from jwt import PyJWKClient, PyJWTError as JWTError
    _USE_JOSE = False
except ImportError:
    from jose import jwt as _pyjwt, JWTError
    PyJWKClient = None
    _USE_JOSE = True

from .config import settings
from .database import get_db
from .models import PendingRegistration, User, UserRole

logger = logging.getLogger("sightlink_auth")

security = HTTPBearer(auto_error=False)
optional_security = HTTPBearer(auto_error=False)

SESSION_COOKIE_NAME = "sightlink_session"
CSRF_COOKIE_NAME = "sightlink_csrf"
_GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
_google_verifier_override: Optional[Callable[[str], Awaitable[dict] | dict]] = None


def set_google_verifier_override(fn: Optional[Callable[[str], Awaitable[dict] | dict]]) -> None:
    global _google_verifier_override
    _google_verifier_override = fn


def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with a unique 16-byte salt."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return f"{salt}:{key.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against stored salt:hash."""
    try:
        salt, stored_hash = hashed_password.split(':')
        key = hashlib.pbkdf2_hmac(
            'sha256',
            plain_password.encode('utf-8'),
            salt.encode('utf-8'),
            100000
        )
        return secrets.compare_digest(key.hex(), stored_hash)
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Encode user information into a signed JWT."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return _pyjwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict:
    return _pyjwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


def set_session_cookies(response: Response, access_token: str) -> str:
    """Set httpOnly session JWT cookie + readable SameSite CSRF double-submit token cookie."""
    csrf_token = secrets.token_urlsafe(24)
    max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    cookie_kwargs = {
        "max_age": max_age,
        "samesite": "lax",
        "secure": settings.COOKIE_SECURE,
        "path": "/",
    }
    if settings.COOKIE_DOMAIN:
        cookie_kwargs["domain"] = settings.COOKIE_DOMAIN

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=access_token,
        httponly=True,
        **cookie_kwargs,
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        **cookie_kwargs,
    )
    return csrf_token


def clear_session_cookies(response: Response) -> None:
    del_kwargs = {"path": "/"}
    if settings.COOKIE_DOMAIN:
        del_kwargs["domain"] = settings.COOKIE_DOMAIN
    response.delete_cookie(SESSION_COOKIE_NAME, **del_kwargs)
    response.delete_cookie(CSRF_COOKIE_NAME, **del_kwargs)


def _enforce_csrf_for_cookie_request(request: Request) -> None:
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME) or ""
        csrf_header = request.headers.get("x-csrf-token") or ""
        if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF validation failed for cookie session.",
            )


def _extract_token_from_request(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials],
) -> tuple[Optional[str], bool]:
    """Return (jwt_token, used_cookie_auth)."""
    if credentials and credentials.credentials:
        return credentials.credentials, False
    cookie_tok = request.cookies.get(SESSION_COOKIE_NAME)
    if cookie_tok:
        return cookie_tok, True
    return None, False


def verify_google_id_token(id_token: str) -> dict:
    """
    Verify a Google Identity Services ID token on the server and assert email_verified == True.
    """
    if _google_verifier_override is not None:
        payload = _google_verifier_override(id_token)
    else:
        payload = None
        client_id = (settings.GOOGLE_CLIENT_ID or "").strip().strip("'\"").strip()
        if not client_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Google Sign-In is not configured on the server (set GOOGLE_CLIENT_ID).",
            )

        if PyJWKClient is not None:
            try:
                jwk_client = PyJWKClient(_GOOGLE_CERTS_URL)
                signing_key = jwk_client.get_signing_key_from_jwt(id_token)
                payload = _pyjwt.decode(
                    id_token,
                    signing_key.key,
                    algorithms=["RS256"],
                    audience=client_id,
                    issuer=["accounts.google.com", "https://accounts.google.com"],
                )
            except Exception as exc:
                logger.warning("Google JWKS verification failed: %s", exc)
                payload = None

        if payload is None:
            try:
                resp = requests.get(
                    "https://oauth2.googleapis.com/tokeninfo",
                    params={"id_token": id_token},
                    timeout=8,
                )
                if not resp.ok:
                    raise HTTPException(status_code=401, detail="Invalid Google ID token.")
                payload = resp.json()
                if payload.get("aud") != client_id:
                    raise HTTPException(status_code=401, detail="Google token audience mismatch.")
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(status_code=401, detail="Unable to verify Google Sign-In token.")

    email = (payload.get("email") or "").strip().lower()
    email_verified = payload.get("email_verified")
    if isinstance(email_verified, str):
        email_verified = email_verified.lower() == "true"

    if not email or not email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Google account must have a verified email address.",
        )
    return {
        "sub": str(payload.get("sub") or ""),
        "email": email,
        "name": (payload.get("name") or email.split("@")[0]).strip(),
        "picture": payload.get("picture"),
        "email_verified": True,
    }


def require_verified_email(user: User) -> User:
    if not bool(getattr(user, "email_verified", False)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email address with the 6-digit code before sending SOS alerts to family or using volunteer actions.",
        )
    return user


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Validate Bearer JWT or httpOnly session cookie (with CSRF check on cookie mutations)."""
    token, used_cookie = _extract_token_from_request(request, credentials)
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or token expired",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception

    if used_cookie:
        _enforce_csrf_for_cookie_request(request)

    try:
        payload = decode_access_token(token)
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        if payload.get("typ") == "pending_signup":
            pending = db.query(PendingRegistration).filter(PendingRegistration.id == user_id).first()
            if pending is not None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Please verify your email address with the 6-digit code before sending SOS alerts to family or using volunteer actions.",
                )
        raise credentials_exception
    if getattr(user, "is_suspended", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is suspended due to safety policy review."
        )
    return user


def get_auth_subject(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> tuple[Optional[User], Optional[PendingRegistration]]:
    """Resolve either a registered User or an unverified PendingRegistration during signup verification."""
    token, used_cookie = _extract_token_from_request(request, credentials)
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or token expired",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception

    if used_cookie:
        _enforce_csrf_for_cookie_request(request)

    try:
        payload = decode_access_token(token)
        sub: str = payload.get("sub")
        if sub is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == sub).first()
    if user is not None:
        if getattr(user, "is_suspended", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is suspended due to safety policy review.",
            )
        return user, None

    if payload.get("typ") == "pending_signup":
        pending = db.query(PendingRegistration).filter(PendingRegistration.id == sub).first()
        if pending is not None:
            return None, pending

    raise credentials_exception


def get_optional_auth_subject(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: Session = Depends(get_db),
) -> tuple[Optional[User], Optional[PendingRegistration]]:
    token, used_cookie = _extract_token_from_request(request, credentials)
    if not token:
        return None, None
    if used_cookie:
        _enforce_csrf_for_cookie_request(request)
    try:
        payload = decode_access_token(token)
        sub = payload.get("sub")
        if not sub:
            return None, None
        user = db.query(User).filter(User.id == sub).first()
        if user is not None:
            return user, None
        if payload.get("typ") == "pending_signup":
            pending = db.query(PendingRegistration).filter(PendingRegistration.id == sub).first()
            return None, pending
        return None, None
    except Exception:
        return None, None


def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    token, used_cookie = _extract_token_from_request(request, credentials)
    if not token:
        return None
    if used_cookie:
        _enforce_csrf_for_cookie_request(request)
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None
        return db.query(User).filter(User.id == user_id).first()
    except Exception:
        return None


def require_role(required_role: UserRole):
    """Enforces role-based access control (e.g., BLIND_USER, VOLUNTEER, FAMILY)."""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Requires role '{required_role.value}'"
            )
        return current_user
    return role_checker


def require_roles(allowed_roles: Iterable[UserRole]):
    allowed = set(allowed_roles)

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed:
            names = ", ".join(r.value for r in allowed)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Requires one of roles [{names}]"
            )
        return current_user
    return role_checker
