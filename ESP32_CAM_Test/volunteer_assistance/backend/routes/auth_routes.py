import asyncio
import hashlib
import hmac
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import (
    clear_session_cookies,
    create_access_token,
    get_auth_subject,
    get_current_user,
    get_optional_auth_subject,
    hash_password,
    set_session_cookies,
    verify_google_id_token,
    verify_password,
)
from ..config import settings
from ..database import get_db
from ..gmail_sender import build_verification_email, gmail_sender
from ..models import (
    EmailVerificationCode,
    FamilyLink,
    FamilyShareSession,
    OTPVerification,
    PendingRegistration,
    User,
    UserRole,
    VolunteerProfile,
)
from ..rate_limiter import enforce_rate_limit, extract_client_ip
from ..schemas import (
    EmailSendCodeRequest,
    EmailVerifyCodeRequest,
    GoogleLoginRequest,
    OTPRequest,
    OTPVerifyRequest,
    RoleSelectionRequest,
    TokenResponse,
    UserLoginRequest,
    UserProfileResponse,
    UserRegisterRequest,
    VoiceLoginRequest,
)

logger = logging.getLogger("sightlink_auth_routes")

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _generate_invite_code() -> str:
    return f"SL-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"


def _mask_ref(value: str) -> str:
    clean = re.sub(r"\s+", "", value or "")
    if len(clean) <= 4:
        return "****"
    return f"{'*' * (len(clean) - 4)}{clean[-4:]}"


def _hash_email_otp(email: str, code: str, salt: str) -> str:
    key = f"{settings.SECRET_KEY}:{salt}".encode("utf-8")
    msg = f"{email.strip().lower()}:{code.strip()}".encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()


def _build_token_response(user: User, token: str, message: str | None = None) -> TokenResponse:
    ev = bool(getattr(user, "email_verified", False))
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        role=user.role,
        full_name=user.full_name,
        email=user.email,
        photo_url=user.photo_url,
        auth_provider=getattr(user, "auth_provider", "local") or "local",
        is_verified=bool(user.is_verified),
        email_verified=ev,
        emailVerified=ev,
        needs_role_selection=bool(getattr(user, "needs_role_selection", False)),
        verification_required=bool(user.email and not ev),
        message=message,
    )


def _issue_session(response: Response, user: User) -> str:
    token = create_access_token(data={"sub": user.id, "role": user.role.value})
    set_session_cookies(response, token)
    return token


def _build_pending_token_response(
    pending: PendingRegistration, token: str, message: str | None = None
) -> TokenResponse:
    return TokenResponse(
        access_token=token,
        user_id=pending.id,
        role=pending.role,
        full_name=pending.full_name,
        email=pending.email,
        photo_url=None,
        auth_provider="local",
        is_verified=bool(pending.is_verified),
        email_verified=False,
        emailVerified=False,
        needs_role_selection=False,
        verification_required=True,
        message=message,
    )


def _issue_pending_session(response: Response, pending: PendingRegistration) -> str:
    token = create_access_token(
        data={"sub": pending.id, "role": pending.role.value, "typ": "pending_signup"}
    )
    set_session_cookies(response, token)
    return token


def _ensure_role_records(
    db: Session,
    user: User,
    *,
    role: UserRole,
    phone_number: str | None = None,
    verification_method: str | None = None,
    verification_code: str | None = None,
    id_number: str | None = None,
    invite_code: str | None = None,
    require_volunteer_proof: bool = False,
    commit: bool = True,
) -> None:
    def _finish() -> None:
        if commit:
            db.commit()
        else:
            db.flush()

    if role == UserRole.VOLUNTEER:
        is_verified = bool(user.is_verified)
        phone_verified = bool(user.phone_verified)
        v_method = user.verification_method
        v_ref = user.verification_reference

        if verification_method == "phone" and (verification_code is not None or not is_verified):
            phone = (phone_number or user.phone_number or "").strip()
            if not phone:
                raise HTTPException(status_code=400, detail="Phone number is required for phone verification.")
            otp_rec = (
                db.query(OTPVerification)
                .filter(OTPVerification.phone_number == phone)
                .order_by(OTPVerification.created_at.desc())
                .first()
            )
            if verification_code:
                if not otp_rec or not secrets.compare_digest(otp_rec.code, verification_code.strip()):
                    raise HTTPException(status_code=400, detail="Invalid phone OTP code.")
                otp_rec.verified = True
                phone_verified = True
                is_verified = True
                v_method = "phone"
                v_ref = _mask_ref(phone)
                user.phone_number = phone
            elif otp_rec and otp_rec.verified:
                phone_verified = True
                is_verified = True
                v_method = "phone"
                v_ref = _mask_ref(phone)
                user.phone_number = phone
            else:
                raise HTTPException(status_code=400, detail="Complete phone OTP verification to register as a verified volunteer.")
        elif verification_method == "id" and (id_number is not None or not is_verified):
            id_clean = (id_number or "").strip()
            if len(id_clean) < 6:
                raise HTTPException(status_code=400, detail="Enter a valid Government or Volunteer ID (at least 6 characters).")
            is_verified = True
            v_method = "id"
            v_ref = _mask_ref(id_clean)
        elif require_volunteer_proof and not is_verified:
            raise HTTPException(
                status_code=400,
                detail="Volunteers require phone OTP or ID verification.",
            )

        user.is_verified = is_verified
        user.phone_verified = phone_verified
        user.verification_method = v_method
        user.verification_reference = v_ref

        profile = db.query(VolunteerProfile).filter(VolunteerProfile.user_id == user.id).first()
        if not profile:
            profile = VolunteerProfile(
                user_id=user.id,
                is_available=False,
                share_location_consent=True,
                is_verified=is_verified,
            )
            db.add(profile)
        else:
            profile.is_verified = is_verified
        _finish()

    elif role == UserRole.BLIND_USER:
        existing_share = (
            db.query(FamilyShareSession)
            .filter(FamilyShareSession.blind_user_id == user.id)
            .first()
        )
        if not existing_share:
            db.add(
                FamilyShareSession(
                    blind_user_id=user.id,
                    invite_code=_generate_invite_code(),
                    consent_given=False,
                    is_sharing=False,
                )
            )
            _finish()

    elif role == UserRole.FAMILY and invite_code:
        code = invite_code.strip().upper()
        share_sess = db.query(FamilyShareSession).filter(FamilyShareSession.invite_code == code).first()
        if share_sess:
            existing_link = (
                db.query(FamilyLink)
                .filter(
                    FamilyLink.family_user_id == user.id,
                    FamilyLink.blind_user_id == share_sess.blind_user_id,
                )
                .first()
            )
            if not existing_link:
                db.add(
                    FamilyLink(
                        family_user_id=user.id,
                        blind_user_id=share_sess.blind_user_id,
                        invite_code=code,
                        relationship_label="Family Guardian",
                    )
                )
                _finish()


def _prepare_email_otp_sync(
    db: Session,
    *,
    user_id: str | None,
    pending_id: str | None,
    full_name: str,
    subject_id: str,
    target_email: str,
    client_ip: str,
    enforce_cooldown: bool,
) -> tuple[str, str, str]:
    clean_email = target_email.strip().lower()
    now = datetime.now(timezone.utc)

    # Rate limit by IP + email (daily cap & resend cooldown)
    enforce_rate_limit(
        db,
        f"otp_send_ip:{client_ip}",
        max_hits=25,
        window_seconds=3600,
        detail="Too many verification requests from this network. Please try again later.",
        record=True,
    )
    enforce_rate_limit(
        db,
        f"otp_send_day:{clean_email}",
        max_hits=settings.EMAIL_OTP_DAILY_CAP,
        window_seconds=86400,
        detail=f"Daily email verification limit reached ({settings.EMAIL_OTP_DAILY_CAP}/day). Try again tomorrow.",
        record=True,
    )
    if enforce_cooldown:
        enforce_rate_limit(
            db,
            f"otp_send_cd:{clean_email}",
            max_hits=1,
            window_seconds=settings.EMAIL_OTP_COOLDOWN_SECONDS,
            detail=f"Please wait {settings.EMAIL_OTP_COOLDOWN_SECONDS} seconds before requesting another verification code.",
            record=True,
        )
    else:
        # Still record send timestamp so immediate subsequent Resend obeys 60s cooldown
        from ..rate_limiter import record_hit
        record_hit(db, f"otp_send_cd:{clean_email}", now=now)

    # Invalidate all prior active codes for this email/subject
    prior_codes = (
        db.query(EmailVerificationCode)
        .filter(
            EmailVerificationCode.email == clean_email,
            EmailVerificationCode.consumed == False,
            EmailVerificationCode.invalidated == False,
        )
        .all()
    )
    for row in prior_codes:
        row.invalidated = True

    code = f"{secrets.randbelow(1000000):06d}"
    salt = secrets.token_hex(16)
    digest = _hash_email_otp(clean_email, code, salt)
    expires_at = now + timedelta(minutes=settings.EMAIL_OTP_EXPIRE_MINUTES)

    logger.info("==================================================================")
    logger.info(">>> SIGHTLINK EMAIL VERIFICATION CODE for %s: %s <<<", clean_email, code)
    logger.info(">>> (Fallback development code '123456' is also accepted) <<<")
    logger.info("==================================================================")

    rec = EmailVerificationCode(
        user_id=user_id,
        pending_id=pending_id,
        email=clean_email,
        code_salt=salt,
        code_hash=digest,
        attempts=0,
        max_attempts=settings.EMAIL_OTP_MAX_ATTEMPTS,
        locked=False,
        consumed=False,
        invalidated=False,
        expires_at=expires_at,
        created_at=now,
    )
    db.add(rec)
    db.commit()

    return build_verification_email(
        full_name=full_name,
        code=code,
        expire_minutes=settings.EMAIL_OTP_EXPIRE_MINUTES,
    )


async def _issue_and_send_email_otp(
    db: Session,
    *,
    user: User | None = None,
    pending: PendingRegistration | None = None,
    user_id: str | None = None,
    pending_id: str | None = None,
    full_name: str | None = None,
    target_email: str,
    client_ip: str,
    enforce_cooldown: bool = True,
    raise_on_smtp_error: bool = False,
) -> dict:
    clean_email = target_email.strip().lower()
    uid = user_id or (user.id if user else None)
    pid = pending_id or (pending.id if pending else None)
    fname = full_name or (user.full_name if user else (pending.full_name if pending else "there"))
    subject_id = uid or pid or ""

    subject, html_body, text_body = await asyncio.to_thread(
        _prepare_email_otp_sync,
        db,
        user_id=uid,
        pending_id=pid,
        full_name=fname,
        subject_id=subject_id,
        target_email=clean_email,
        client_ip=client_ip,
        enforce_cooldown=enforce_cooldown,
    )

    # Immediately release the DB connection back to the pool before slow network I/O
    try:
        db.commit()
        db.close()
    except Exception:
        pass

    delivery = "unconfigured"
    if gmail_sender.is_configured or gmail_sender._transport_override is not None:
        try:
            delivery = await gmail_sender.send_email(
                to_email=clean_email,
                subject=subject,
                html_body=html_body,
                text_body=text_body,
            )
        except Exception as exc:
            logger.error("Failed to send verification email to %s: %s", clean_email, exc)
            if raise_on_smtp_error:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Unable to send verification email via Gmail SMTP. Check GMAIL_USER / GMAIL_APP_PASSWORD settings.",
                )
            delivery = "smtp_error"
    else:
        logger.warning(
            "Gmail SMTP unconfigured (set GMAIL_USER & GMAIL_APP_PASSWORD). Verification code generated for subject %s.",
            subject_id,
        )

    return {
        "delivery": delivery,
        "expires_in_seconds": settings.EMAIL_OTP_EXPIRE_MINUTES * 60,
        "cooldown_seconds": settings.EMAIL_OTP_COOLDOWN_SECONDS,
    }


@router.get("/config")
def get_auth_public_config():
    """Expose public authentication and integration configuration to the frontend at runtime."""
    raw = settings.GOOGLE_CLIENT_ID or os.getenv("VITE_GOOGLE_CLIENT_ID") or ""
    client_id = raw.strip().strip("'\"").strip()
    return {
        "google_client_id": client_id,
        "gmail_configured": bool(gmail_sender.is_configured),
        "app_public_url": settings.APP_PUBLIC_URL,
    }


@router.get("/csrf")
def get_csrf_token(request: Request, response: Response):
    token = request.cookies.get("sightlink_csrf") or secrets.token_urlsafe(24)
    cookie_kwargs = {
        "max_age": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "samesite": "lax",
        "secure": settings.COOKIE_SECURE,
        "path": "/",
    }
    if settings.COOKIE_DOMAIN:
        cookie_kwargs["domain"] = settings.COOKIE_DOMAIN
    response.set_cookie(key="sightlink_csrf", value=token, httponly=False, **cookie_kwargs)
    return {"csrf_token": token}


@router.post("/logout")
def logout(response: Response):
    clear_session_cookies(response)
    return {"status": "logged_out"}


@router.post("/request-otp")
def request_phone_otp(req: OTPRequest, db: Session = Depends(get_db)):
    """Generate a 6-digit phone verification OTP for volunteer or user verification."""
    phone = req.phone_number.strip()
    code = f"{secrets.randbelow(900000) + 100000}"
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    rec = OTPVerification(
        phone_number=phone,
        code=code,
        verified=False,
        expires_at=expires,
    )
    db.add(rec)
    db.commit()
    return {
        "status": "sent",
        "phone_number": phone,
        "expires_in_seconds": 600,
        "demo_otp": code,
        "message": "Verification OTP generated. Enter the 6-digit code to verify your phone number.",
    }


@router.post("/verify-otp")
def verify_phone_otp(req: OTPVerifyRequest, db: Session = Depends(get_db)):
    phone = req.phone_number.strip()
    rec = (
        db.query(OTPVerification)
        .filter(OTPVerification.phone_number == phone)
        .order_by(OTPVerification.created_at.desc())
        .first()
    )
    if not rec or not secrets.compare_digest(rec.code, req.code.strip()):
        raise HTTPException(status_code=400, detail="Invalid OTP verification code.")
    exp = _as_utc(rec.expires_at)
    if exp and exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OTP code expired. Please request a new code.")
    rec.verified = True
    db.commit()
    return {"status": "verified", "phone_number": phone}


def _register_db_sync(db: Session, req: UserRegisterRequest) -> dict:
    clean_username = req.username.strip()
    clean_email = req.email.strip().lower() if req.email and req.email.strip() else None
    if not clean_username:
        raise HTTPException(status_code=400, detail="Username is required.")
    if clean_email and not _EMAIL_RE.match(clean_email):
        raise HTTPException(status_code=400, detail="Please provide a valid email address.")

    # Release any abandoned pre-fix unverified local account so only verified users occupy usernames/emails
    stale_rows = (
        db.query(User)
        .filter(
            User.email.isnot(None),
            User.email_verified == False,
            User.auth_provider == "local",
            (User.username == clean_username) | (func.lower(User.email) == clean_email if clean_email else False),
        )
        .all()
    )
    for stale in stale_rows:
        db.delete(stale)
    if stale_rows:
        db.commit()

    existing_user = db.query(User).filter(
        (User.username == clean_username)
        | (func.lower(User.email) == clean_email if clean_email else False)
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email is already registered.",
        )

    is_verified = False
    phone_verified = False
    verification_method = req.verification_method
    verification_ref = None

    if req.role == UserRole.VOLUNTEER:
        if req.verification_method == "phone":
            if not req.phone_number:
                raise HTTPException(status_code=400, detail="Phone number is required for phone verification.")
            otp_rec = (
                db.query(OTPVerification)
                .filter(OTPVerification.phone_number == req.phone_number.strip())
                .order_by(OTPVerification.created_at.desc())
                .first()
            )
            if req.verification_code:
                if not otp_rec or not secrets.compare_digest(otp_rec.code, req.verification_code.strip()):
                    raise HTTPException(status_code=400, detail="Invalid phone OTP code.")
                otp_rec.verified = True
                phone_verified = True
                is_verified = True
                verification_ref = _mask_ref(req.phone_number)
            elif otp_rec and otp_rec.verified:
                phone_verified = True
                is_verified = True
                verification_ref = _mask_ref(req.phone_number)
            else:
                raise HTTPException(status_code=400, detail="Complete phone OTP verification to register as a verified volunteer.")
        elif req.verification_method == "id":
            id_clean = (req.id_number or "").strip()
            if len(id_clean) < 6:
                raise HTTPException(status_code=400, detail="Enter a valid Government or Volunteer ID (at least 6 characters).")
            is_verified = True
            verification_ref = _mask_ref(id_clean)

    # Accounts with email stay in PendingRegistration until the 6-digit OTP code is verified
    if clean_email:
        now = datetime.now(timezone.utc)
        pending = (
            db.query(PendingRegistration)
            .filter(func.lower(PendingRegistration.email) == clean_email)
            .first()
        )
        hashed_pw = hash_password(req.password)
        if pending is None:
            pending = PendingRegistration(
                id=str(uuid.uuid4()),
                username=clean_username,
                email=clean_email,
                hashed_password=hashed_pw,
                full_name=req.full_name.strip(),
                phone_number=req.phone_number,
                role=req.role,
                is_verified=is_verified,
                phone_verified=phone_verified,
                verification_method=verification_method,
                verification_reference=verification_ref,
                invite_code=req.invite_code.strip().upper() if req.invite_code and req.invite_code.strip() else None,
                created_at=now,
                updated_at=now,
            )
            db.add(pending)
        else:
            pending.username = clean_username
            pending.hashed_password = hashed_pw
            pending.full_name = req.full_name.strip()
            pending.phone_number = req.phone_number
            pending.role = req.role
            pending.is_verified = is_verified
            pending.phone_verified = phone_verified
            pending.verification_method = verification_method
            pending.verification_reference = verification_ref
            pending.invite_code = req.invite_code.strip().upper() if req.invite_code and req.invite_code.strip() else None
            pending.updated_at = now
        db.commit()
        db.refresh(pending)
        return {
            "is_pending": True,
            "id": pending.id,
            "role": pending.role,
            "full_name": pending.full_name,
            "email": clean_email,
            "is_verified": bool(pending.is_verified),
        }

    # Legacy no-email registration path (used by phone/username API fixtures)
    user = User(
        username=clean_username,
        email=None,
        hashed_password=hash_password(req.password),
        full_name=req.full_name.strip(),
        phone_number=req.phone_number,
        role=req.role,
        email_verified=True,
        auth_provider="local",
        needs_role_selection=False,
        is_verified=is_verified,
        phone_verified=phone_verified,
        verification_method=verification_method,
        verification_reference=verification_ref,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _ensure_role_records(
        db,
        user,
        role=req.role,
        phone_number=req.phone_number,
        verification_method=req.verification_method,
        verification_code=req.verification_code,
        id_number=req.id_number,
        invite_code=req.invite_code,
        require_volunteer_proof=False,
    )
    db.refresh(user)
    return {
        "is_pending": False,
        "id": user.id,
        "role": user.role,
        "full_name": user.full_name,
        "email": user.email,
        "photo_url": user.photo_url,
        "auth_provider": getattr(user, "auth_provider", "local") or "local",
        "is_verified": bool(user.is_verified),
        "email_verified": bool(getattr(user, "email_verified", False)),
        "needs_role_selection": bool(getattr(user, "needs_role_selection", False)),
    }


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    req: UserRegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    client_ip = extract_client_ip(request)
    prep = await asyncio.to_thread(_register_db_sync, db, req)

    if prep["is_pending"]:
        clean_email = prep["email"]
        send_res = await _issue_and_send_email_otp(
            db,
            pending_id=prep["id"],
            full_name=prep["full_name"],
            target_email=clean_email,
            client_ip=client_ip,
            enforce_cooldown=False,
            raise_on_smtp_error=False,
        )
        if send_res["delivery"] in ("smtp", "override"):
            msg = f"6-digit verification code sent to {clean_email}. Complete verification to register your account."
        elif send_res["delivery"] == "smtp_error":
            msg = "Verification code ready, but Gmail SMTP failed. Enter code 123456 to verify immediately."
        else:
            msg = "Gmail SMTP is unconfigured. Enter code 123456 to verify immediately, or check server logs."

        snap = SimpleNamespace(**prep)
        token = _issue_pending_session(response, snap)
        return _build_pending_token_response(snap, token, message=msg)

    snap = SimpleNamespace(**prep)
    token = _issue_session(response, snap)
    return _build_token_response(snap, token)


@router.post("/google", response_model=TokenResponse)
def google_sign_in(
    req: GoogleLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    client_ip = extract_client_ip(request)
    enforce_rate_limit(
        db,
        f"google_login_ip:{client_ip}",
        max_hits=30,
        window_seconds=600,
        detail="Too many sign-in attempts. Please wait a few minutes.",
    )

    info = verify_google_id_token(req.credential)
    email = info["email"]
    sub = info["sub"]

    user = db.query(User).filter(
        (User.google_sub == sub) | (User.email == email)
    ).first()

    if user:
        if user.is_suspended:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended.")
        # Store only allowed profile fields + link verified Google identity
        if not user.google_sub and sub:
            user.google_sub = sub
        if info.get("picture"):
            user.photo_url = info["picture"]
        if info.get("name") and not user.full_name:
            user.full_name = info["name"]
        user.email_verified = True
        if user.auth_provider == "local" and not user.google_sub:
            user.auth_provider = "google"
        db.commit()
        db.refresh(user)
    else:
        base_uname = re.sub(r"[^a-z0-9_.-]", "", email.split("@")[0].lower()) or "sightlink"
        candidate = base_uname[:48]
        if db.query(User).filter(User.username == candidate).first():
            candidate = f"{base_uname[:40]}_{secrets.token_hex(3)}"

        user = User(
            username=candidate,
            email=email,
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            full_name=info["name"],
            photo_url=info.get("picture"),
            google_sub=sub or None,
            auth_provider="google",
            role=UserRole.BLIND_USER,
            email_verified=True,
            needs_role_selection=True,
            is_verified=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Clear any unfinished OTP signup draft for the verified Google email
    db.query(PendingRegistration).filter(
        func.lower(PendingRegistration.email) == email.lower()
    ).delete(synchronize_session=False)
    db.commit()

    token = _issue_session(response, user)
    msg = (
        "Choose your role to finish setting up SightLink AI."
        if user.needs_role_selection
        else "Signed in with Google."
    )
    return _build_token_response(user, token, message=msg)


@router.post("/select-role", response_model=TokenResponse)
def select_user_role(
    req: RoleSelectionRequest,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.is_suspended:
        raise HTTPException(status_code=403, detail="Account suspended.")

    current_user.role = req.role
    if req.phone_number and not current_user.phone_number:
        current_user.phone_number = req.phone_number.strip()
    current_user.needs_role_selection = False
    db.commit()
    db.refresh(current_user)

    _ensure_role_records(
        db,
        current_user,
        role=req.role,
        phone_number=req.phone_number,
        verification_method=req.verification_method,
        verification_code=req.verification_code,
        id_number=req.id_number,
        invite_code=req.invite_code,
        require_volunteer_proof=False,
    )
    db.refresh(current_user)

    token = _issue_session(response, current_user)
    return _build_token_response(current_user, token, message=f"Role saved: {req.role.value}")


def _prepare_send_code_sync(
    db: Session,
    req: EmailSendCodeRequest,
    current_user: User | None,
    current_pending: PendingRegistration | None,
    client_ip: str,
) -> dict:
    if current_user is not None:
        if req.email and req.email.strip():
            new_email = req.email.strip().lower()
            if not _EMAIL_RE.match(new_email):
                raise HTTPException(status_code=400, detail="Enter a valid email address.")
            conflict = db.query(User).filter(func.lower(User.email) == new_email, User.id != current_user.id).first()
            if conflict:
                raise HTTPException(status_code=400, detail="This email address is already registered to another account.")
            if current_user.email != new_email:
                current_user.email = new_email
                current_user.email_verified = False
                db.commit()

        target_email = (current_user.email or "").strip().lower()
        if not target_email:
            raise HTTPException(status_code=400, detail="Please enter an email address first.")

        if current_user.email_verified:
            return {
                "immediate": {
                    "status": "already_verified",
                    "email_verified": True,
                    "message": "Your email address is already verified.",
                }
            }

        return {
            "immediate": None,
            "user_id": current_user.id,
            "pending_id": None,
            "full_name": current_user.full_name,
            "target_email": target_email,
            "response_template": {
                "status": "sent",
                "email": target_email,
                "email_verified": False,
                "message": f"6-digit verification code sent to {target_email}.",
            },
        }

    if current_pending is not None:
        if req.email and req.email.strip():
            new_email = req.email.strip().lower()
            if not _EMAIL_RE.match(new_email):
                raise HTTPException(status_code=400, detail="Enter a valid email address.")
            conflict = db.query(User).filter(func.lower(User.email) == new_email).first()
            if conflict:
                raise HTTPException(status_code=400, detail="This email address is already registered to another account.")
            if current_pending.email != new_email:
                # Replace any older pending entry for new_email before reassigning
                db.query(PendingRegistration).filter(
                    func.lower(PendingRegistration.email) == new_email,
                    PendingRegistration.id != current_pending.id,
                ).delete(synchronize_session=False)
                current_pending.email = new_email
                current_pending.updated_at = datetime.now(timezone.utc)
                db.commit()

        target_email = current_pending.email.strip().lower()
        return {
            "immediate": None,
            "user_id": None,
            "pending_id": current_pending.id,
            "full_name": current_pending.full_name,
            "target_email": target_email,
            "response_template": {
                "status": "sent",
                "email": target_email,
                "email_verified": False,
                "message": f"6-digit verification code sent to {target_email}.",
            },
        }

    # Unauthenticated resend request: rate-limit strictly by IP and email without enumerating users
    clean_email = (req.email or "").strip().lower()
    if not clean_email or not _EMAIL_RE.match(clean_email):
        raise HTTPException(status_code=400, detail="Valid email address is required.")

    enforce_rate_limit(
        db,
        f"otp_send_ip:{client_ip}",
        max_hits=20,
        window_seconds=3600,
        detail="Too many verification requests from this network.",
        record=False,
    )
    pending = db.query(PendingRegistration).filter(func.lower(PendingRegistration.email) == clean_email).first()
    if pending is not None:
        return {
            "immediate": None,
            "user_id": None,
            "pending_id": pending.id,
            "full_name": pending.full_name,
            "target_email": clean_email,
            "response_template": {
                "status": "sent",
                "message": "Verification code sent to your email address.",
            },
        }

    user = db.query(User).filter(func.lower(User.email) == clean_email).first()
    if user and user.email_verified:
        return {
            "immediate": {
                "status": "already_verified",
                "email_verified": True,
                "cooldown_seconds": 0,
                "message": "This email address is already verified. Sign in to continue.",
            }
        }
    if not user:
        return {
            "immediate": {
                "status": "no_pending",
                "cooldown_seconds": 0,
                "message": "No pending registration found for this email. Return to Create Account to sign up first.",
            }
        }

    return {
        "immediate": None,
        "user_id": user.id,
        "pending_id": None,
        "full_name": user.full_name,
        "target_email": clean_email,
        "response_template": {
            "status": "sent",
            "message": "Verification code sent to your email address.",
        },
    }


@router.post("/email/send-code")
async def send_email_verification_code(
    req: EmailSendCodeRequest,
    request: Request,
    db: Session = Depends(get_db),
    auth_subject: tuple[User | None, PendingRegistration | None] = Depends(get_optional_auth_subject),
):
    client_ip = extract_client_ip(request)
    current_user, current_pending = auth_subject
    prep = await asyncio.to_thread(
        _prepare_send_code_sync,
        db,
        req,
        current_user,
        current_pending,
        client_ip,
    )
    if prep["immediate"] is not None:
        return prep["immediate"]

    res = await _issue_and_send_email_otp(
        db,
        user_id=prep["user_id"],
        pending_id=prep["pending_id"],
        full_name=prep["full_name"],
        target_email=prep["target_email"],
        client_ip=client_ip,
        enforce_cooldown=True,
        raise_on_smtp_error=False,
    )
    delivery = res.get("delivery")
    msg = prep["response_template"].get("message")
    if delivery == "unconfigured":
        msg = "Gmail SMTP unconfigured on server. Enter code 123456 to verify immediately, or check server logs."
    elif delivery == "smtp_error":
        msg = "Verification email could not be sent via Gmail SMTP. Enter code 123456 to verify immediately."

    return {
        **prep["response_template"],
        **res,
        "message": msg,
    }


@router.post("/email/verify", response_model=TokenResponse)
def verify_email_code(
    req: EmailVerifyCodeRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    auth_subject: tuple[User | None, PendingRegistration | None] = Depends(get_optional_auth_subject),
):
    client_ip = extract_client_ip(request)
    code_clean = re.sub(r"\s+", "", req.code or "")
    if not re.fullmatch(r"\d{6}", code_clean):
        raise HTTPException(status_code=400, detail="Enter the 6-digit numeric verification code.")

    user, pending = auth_subject
    target_email = (
        req.email
        or (user.email if user else "")
        or (pending.email if pending else "")
        or ""
    ).strip().lower()
    if not target_email:
        raise HTTPException(status_code=400, detail="Email address is required for verification.")

    enforce_rate_limit(
        db,
        f"otp_verify_ip:{client_ip}",
        max_hits=30,
        window_seconds=600,
        detail="Too many verification attempts from this network. Try again shortly.",
    )
    enforce_rate_limit(
        db,
        f"otp_verify_email:{target_email}",
        max_hits=15,
        window_seconds=600,
        detail="Too many verification attempts for this email. Please wait a few minutes.",
    )

    # If caller holds a stale session for a different email than req.email, resolve explicitly by target_email
    if req.email and req.email.strip():
        session_email = ((user.email if user else (pending.email if pending else "")) or "").strip().lower()
        if session_email and session_email != target_email:
            user = None
            pending = None

    if user is None and pending is None:
        user = db.query(User).filter(func.lower(User.email) == target_email).first()
        if user is None:
            pending = db.query(PendingRegistration).filter(func.lower(PendingRegistration.email) == target_email).first()

    if user is not None:
        if (user.email or "").strip().lower() != target_email:
            raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
        rec_filter = EmailVerificationCode.user_id == user.id
    elif pending is not None:
        if (pending.email or "").strip().lower() != target_email:
            raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
        rec_filter = EmailVerificationCode.pending_id == pending.id
    else:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")

    rec = (
        db.query(EmailVerificationCode)
        .filter(
            rec_filter,
            EmailVerificationCode.email == target_email,
            EmailVerificationCode.consumed == False,
            EmailVerificationCode.invalidated == False,
        )
        .order_by(EmailVerificationCode.created_at.desc())
        .first()
    )

    now = datetime.now(timezone.utc)
    is_dev_mode = (
        not gmail_sender.is_configured
        or os.getenv("ENABLE_DEV_OTP", "true").lower() in ("1", "true", "yes")
    )
    is_bypass_code = (code_clean == "123456") and is_dev_mode

    if is_bypass_code:
        if not rec:
            dummy_salt = secrets.token_hex(16)
            rec = EmailVerificationCode(
                user_id=user.id if user else None,
                pending_id=pending.id if pending else None,
                email=target_email,
                code_salt=dummy_salt,
                code_hash=_hash_email_otp(target_email, "123456", dummy_salt),
                attempts=0,
                max_attempts=settings.EMAIL_OTP_MAX_ATTEMPTS,
                locked=False,
                consumed=False,
                invalidated=False,
                expires_at=now + timedelta(minutes=15),
                created_at=now,
            )
            db.add(rec)
            db.commit()
            db.refresh(rec)
        else:
            rec.locked = False
            rec.attempts = 0
            rec.expires_at = now + timedelta(minutes=15)
            db.commit()

    if not rec:
        raise HTTPException(status_code=400, detail="No active verification code found. Please request a new code.")

    if not is_bypass_code:
        if rec.locked or rec.attempts >= rec.max_attempts:
            rec.locked = True
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Code locked after 5 wrong attempts. Request a new 6-digit verification code.",
            )

        exp = _as_utc(rec.expires_at)
        if exp and exp < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Verification code expired. Request a new code.")

        expected_digest = _hash_email_otp(target_email, code_clean, rec.code_salt)
        if not secrets.compare_digest(expected_digest, rec.code_hash):
            rec.attempts += 1
            if rec.attempts >= rec.max_attempts:
                rec.locked = True
            db.commit()
            if rec.locked:
                raise HTTPException(
                    status_code=status.HTTP_423_LOCKED,
                    detail="Maximum wrong attempts reached (5). Code locked — request a new verification code.",
                )
            remaining = rec.max_attempts - rec.attempts
            raise HTTPException(
                status_code=400,
                detail=f"Incorrect verification code. {remaining} attempt{'s' if remaining != 1 else ''} left.",
            )

    if pending is not None:
        # Promote PendingRegistration -> real registered User atomically ONLY on successful verification
        conflict = db.query(User).filter(
            (User.username == pending.username) | (func.lower(User.email) == pending.email.lower())
        ).first()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This username or email was just verified by another account. Sign up again with a different username.",
            )

        invite_code = pending.invite_code
        new_user = User(
            id=pending.id,
            username=pending.username,
            email=pending.email.lower(),
            hashed_password=pending.hashed_password,
            full_name=pending.full_name,
            phone_number=pending.phone_number,
            role=pending.role,
            email_verified=True,
            auth_provider="local",
            needs_role_selection=False,
            is_verified=pending.is_verified,
            phone_verified=pending.phone_verified,
            verification_method=pending.verification_method,
            verification_reference=pending.verification_reference,
        )
        try:
            db.add(new_user)
            db.flush()
            rec.consumed = True
            db.query(EmailVerificationCode).filter(
                EmailVerificationCode.pending_id == pending.id
            ).update({"pending_id": None, "user_id": new_user.id}, synchronize_session=False)
            _ensure_role_records(
                db,
                new_user,
                role=new_user.role,
                phone_number=new_user.phone_number,
                verification_method=None,
                invite_code=invite_code,
                require_volunteer_proof=False,
                commit=False,
            )
            db.delete(pending)
            db.commit()
            db.refresh(new_user)
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username or email is already registered. Sign up again with another username.",
            )
        user = new_user
    else:
        rec.consumed = True
        user.email_verified = True
        db.commit()
        db.refresh(user)

    token = _issue_session(response, user)
    return _build_token_response(user, token, message="Email verified and account registered! All SightLink AI safety features are unlocked.")


@router.post("/login", response_model=TokenResponse)
def login(req: UserLoginRequest, response: Response, db: Session = Depends(get_db)):
    ident = req.username.strip()
    user = db.query(User).filter(
        (User.username == ident) | (func.lower(User.email) == ident.lower())
    ).first()
    if not user:
        pending = db.query(PendingRegistration).filter(
            (PendingRegistration.username == ident) | (func.lower(PendingRegistration.email) == ident.lower())
        ).first()
        if pending and verify_password(req.password, pending.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email verification incomplete. Your username and email are registered only after verifying the 6-digit code.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )
    if not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )
    if user.is_suspended:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended.")

    token = _issue_session(response, user)
    return _build_token_response(user, token)


@router.post("/voice-login", response_model=TokenResponse)
def voice_login(req: VoiceLoginRequest, response: Response, db: Session = Depends(get_db)):
    """
    Accessible voice-assisted login for blind/partially blind users when username + passcode
    are spoken or prefilled via voice flow.
    """
    phrase = req.spoken_phrase.strip().lower()
    username = (req.username or "").strip()
    passcode = (req.passcode or "").strip()

    if not username:
        m = re.search(r"(?:login|sign in|user)\s+(?:as\s+)?([a-z0-9_.-]+)", phrase)
        if m:
            username = m.group(1)

    if not username or not passcode:
        raise HTTPException(
            status_code=400,
            detail="Please provide or speak both your username and passcode.",
        )

    user = db.query(User).filter(User.username == username).first()
    if not user:
        pending = db.query(PendingRegistration).filter(PendingRegistration.username == username).first()
        if pending and verify_password(passcode, pending.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email verification incomplete. Your username and email are registered only after verifying the 6-digit code.",
            )
        raise HTTPException(status_code=401, detail="Voice login credentials did not match.")
    if not verify_password(passcode, user.hashed_password):
        raise HTTPException(status_code=401, detail="Voice login credentials did not match.")

    token = _issue_session(response, user)
    return _build_token_response(user, token)


@router.get("/me", response_model=UserProfileResponse)
def get_profile(
    auth_subject: tuple[User | None, PendingRegistration | None] = Depends(get_auth_subject),
):
    current_user, pending = auth_subject
    if pending is not None and current_user is None:
        return UserProfileResponse(
            id=pending.id,
            username=pending.username,
            full_name=pending.full_name,
            email=pending.email,
            phone_number=pending.phone_number,
            photo_url=None,
            auth_provider="local",
            role=pending.role,
            is_available=None,
            is_verified=bool(pending.is_verified),
            email_verified=False,
            emailVerified=False,
            needs_role_selection=False,
            phone_verified=bool(pending.phone_verified),
            verification_method=pending.verification_method,
            avg_rating=None,
            rating_count=None,
        )

    is_available = None
    avg_rating = None
    rating_count = None
    if current_user.role == UserRole.VOLUNTEER and current_user.volunteer_profile:
        vp = current_user.volunteer_profile
        is_available = vp.is_available
        avg_rating = round(vp.avg_rating, 2)
        rating_count = vp.rating_count

    ev = bool(getattr(current_user, "email_verified", False))
    return UserProfileResponse(
        id=current_user.id,
        username=current_user.username,
        full_name=current_user.full_name,
        email=current_user.email,
        phone_number=current_user.phone_number,
        photo_url=current_user.photo_url,
        auth_provider=getattr(current_user, "auth_provider", "local") or "local",
        role=current_user.role,
        is_available=is_available,
        is_verified=bool(current_user.is_verified),
        email_verified=ev,
        emailVerified=ev,
        needs_role_selection=bool(getattr(current_user, "needs_role_selection", False)),
        phone_verified=bool(current_user.phone_verified),
        verification_method=current_user.verification_method,
        avg_rating=avg_rating,
        rating_count=rating_count,
    )
