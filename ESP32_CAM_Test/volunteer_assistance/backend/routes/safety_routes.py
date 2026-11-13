from datetime import datetime, timezone
from urllib.parse import quote_plus
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import Optional

from ..config import settings
from ..database import get_db
from ..models import (
    User, FamilyShareSession, FamilyLink, TelegramLink, SOSAlert, UserReport, UserBlock, PushSubscription
)
from ..schemas import SOSTriggerRequest, ReportUserRequest, PushSubscriptionRequest
from ..auth import get_current_user, get_optional_auth_subject, get_optional_user, require_verified_email
from ..fcm import fcm_service
from ..notifications_helper import notify_family_event
from ..privacy_crypto import encrypt_coords
from ..rate_limiter import enforce_rate_limit, extract_client_ip

router = APIRouter(prefix="/api", tags=["Safety & Push"])


@router.post("/safety/sos")
async def trigger_sos_alert(
    data: SOSTriggerRequest,
    request: Request,
    db: Session = Depends(get_db),
    auth_subject=Depends(get_optional_auth_subject),
):
    current_user, current_pending = auth_subject
    if current_pending is not None:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email address with the 6-digit code before sending SOS alerts to family or using volunteer actions.",
        )
    client_ip = extract_client_ip(request)
    if current_user:
        require_verified_email(current_user)
        enforce_rate_limit(
            db,
            f"sos_user:{current_user.id}",
            max_hits=settings.SOS_RATE_LIMIT_MAX,
            window_seconds=settings.SOS_RATE_LIMIT_WINDOW_SECONDS,
            detail="SOS rate limit exceeded. Wait briefly before re-sending or call emergency services directly.",
        )
    else:
        enforce_rate_limit(
            db,
            f"sos_ip:{client_ip}",
            max_hits=settings.SOS_RATE_LIMIT_MAX * 2,
            window_seconds=settings.SOS_RATE_LIMIT_WINDOW_SECONDS,
            detail="Too many SOS requests from this network.",
        )

    now = datetime.now(timezone.utc)
    user_id = current_user.id if current_user else None

    alert = SOSAlert(
        user_id=user_id,
        latitude=data.latitude,
        longitude=data.longitude,
        source=data.source,
        notes=data.notes or "Emergency SOS triggered",
        active=True,
        created_at=now,
    )
    db.add(alert)

    battery_val = data.battery_level
    if current_user:
        session = db.query(FamilyShareSession).filter(
            FamilyShareSession.blind_user_id == current_user.id
        ).first()
        if session:
            session.sos_active = True
            session.sos_triggered_at = now
            if battery_val is None:
                battery_val = session.battery_level
            elif battery_val is not None:
                session.battery_level = battery_val
            if data.latitude is not None and data.longitude is not None:
                session.encrypted_last_coords = encrypt_coords(data.latitude, data.longitude)
                session.last_latitude = None
                session.last_longitude = None
                session.last_seen_at = now

    db.commit()
    db.refresh(alert)

    maps_url = (
        f"https://maps.google.com/?q={data.latitude:.6f},{data.longitude:.6f}"
        if (data.latitude is not None and data.longitude is not None)
        else None
    )
    person_name = current_user.full_name if current_user else "SightLink User"
    fallback_lines = [
        f"EMERGENCY SOS from {person_name} at {now.strftime('%H:%M UTC')}.",
    ]
    if maps_url:
        fallback_lines.append(f"Live location: {maps_url}")
    if battery_val is not None:
        fallback_lines.append(f"Battery: {battery_val}%")
    fallback_text = " ".join(fallback_lines)
    encoded_fallback = quote_plus(fallback_text)

    delivery_results = []
    approved_guardians_count = 0
    pending_guardians_count = 0
    self_tg = None

    if current_user:
        approved_guardians_count = (
            db.query(FamilyLink)
            .filter(FamilyLink.blind_user_id == current_user.id, FamilyLink.status == "approved")
            .count()
        )
        pending_guardians_count = (
            db.query(FamilyLink)
            .filter(FamilyLink.blind_user_id == current_user.id, FamilyLink.status == "pending_confirmation")
            .count()
        )
        self_tg = (
            db.query(TelegramLink)
            .filter(TelegramLink.user_id == current_user.id, TelegramLink.is_active == True)
            .first()
        )
        ev = await notify_family_event(
            db,
            current_user.id,
            event_type="SOS_TRIGGERED",
            title="EMERGENCY SOS ALERT",
            body=f"{current_user.full_name} triggered an SOS emergency alert!",
            extra={
                "alert_id": alert.id,
                "latitude": data.latitude,
                "longitude": data.longitude,
                "battery_level": battery_val,
                "sos_active": True,
                "triggered_at": now.isoformat(),
                "maps_url": maps_url,
            },
        )
        delivery_results = getattr(ev, "_channel_deliveries", []) if ev else []

    sent_channels = [d["channel"] for d in delivery_results if d.get("status") == "sent"]
    failed_channels = [d["channel"] for d in delivery_results if d.get("status") == "failed"]

    if sent_channels:
        chan_label = ", ".join(sorted(set(c.upper() if c == "web_push" else c.title() for c in sent_channels)))
        msg = f"SOS recorded and alerts dispatched via {chan_label}."
        if approved_guardians_count == 0:
            msg += " No approved family guardians linked yet — add a Family Guardian in Contacts so they are notified too."
    elif approved_guardians_count == 0 and not self_tg:
        msg = "SOS recorded, but no approved family guardians or Telegram alerts are linked yet. Link Telegram or approve a Family Guardian in Contacts."
    elif failed_channels:
        msg = f"SOS recorded, but external delivery failed ({', '.join(set(failed_channels))}). Use SMS/WhatsApp/112 buttons below."
    else:
        msg = "SOS alert recorded. Use SMS/WhatsApp fallback or link Telegram/Family Guardians for automatic alerts."

    return {
        "status": "sos_active",
        "alert_id": alert.id,
        "triggered_at": now.isoformat(),
        "latitude": data.latitude,
        "longitude": data.longitude,
        "battery_level": battery_val,
        "google_maps_url": maps_url,
        "sms_fallback_url": f"sms:?body={encoded_fallback}",
        "whatsapp_fallback_url": f"https://wa.me/?text={encoded_fallback}",
        "channel_deliveries": delivery_results,
        "sent_channels": sent_channels,
        "approved_guardians_count": approved_guardians_count,
        "pending_guardians_count": pending_guardians_count,
        "self_telegram_connected": bool(self_tg and self_tg.chat_id),
        "self_telegram_username": self_tg.telegram_username if self_tg else None,
        "message": msg,
    }


@router.post("/safety/sos/resolve")
async def resolve_sos_alert(
    db: Session = Depends(get_db),
    auth_subject=Depends(get_optional_auth_subject),
):
    current_user, current_pending = auth_subject
    if current_pending is not None:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email address with the 6-digit code before managing SOS alerts.",
        )
    now = datetime.now(timezone.utc)
    if current_user:
        require_verified_email(current_user)
        active_alerts = db.query(SOSAlert).filter(
            SOSAlert.user_id == current_user.id,
            SOSAlert.active == True
        ).all()
        for a in active_alerts:
            a.active = False
            a.resolved_at = now
        session = db.query(FamilyShareSession).filter(
            FamilyShareSession.blind_user_id == current_user.id
        ).first()
        if session:
            session.sos_active = False
        db.commit()
        await notify_family_event(
            db,
            current_user.id,
            event_type="SOS_RESOLVED",
            title="SOS Resolved",
            body=f"{current_user.full_name} marked the emergency SOS as resolved.",
            extra={"sos_active": False},
        )
    return {"status": "resolved", "sos_active": False}


@router.post("/safety/report")
def report_and_block_user(
    data: ReportUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    target = db.query(User).filter(User.id == data.reported_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Reported user not found")

    report = UserReport(
        reporter_id=current_user.id,
        reported_user_id=target.id,
        request_id=data.request_id,
        reason=data.reason.strip(),
    )
    db.add(report)

    blocked = False
    if data.block_user:
        existing_block = db.query(UserBlock).filter(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_user_id == target.id,
        ).first()
        if not existing_block:
            db.add(UserBlock(blocker_id=current_user.id, blocked_user_id=target.id))
        blocked = True

    db.commit()
    return {
        "status": "reported",
        "report_id": report.id,
        "blocked": blocked,
        "message": "Report submitted" + (" and user blocked from future matching." if blocked else "."),
    }


@router.get("/safety/blocked")
def get_blocked_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    blocks = db.query(UserBlock).filter(UserBlock.blocker_id == current_user.id).all()
    results = []
    for b in blocks:
        u = db.query(User).filter(User.id == b.blocked_user_id).first()
        if u:
            results.append({"user_id": u.id, "full_name": u.full_name, "created_at": b.created_at.isoformat()})
    return results


@router.delete("/safety/block/{blocked_user_id}")
def unblock_user(
    blocked_user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    row = db.query(UserBlock).filter(
        UserBlock.blocker_id == current_user.id,
        UserBlock.blocked_user_id == blocked_user_id
    ).first()
    if row:
        db.delete(row)
        db.commit()
    return {"status": "unblocked", "user_id": blocked_user_id}


@router.get("/push/vapid-public-key")
def get_vapid_public_key():
    return {
        "vapid_public_key": settings.VAPID_PUBLIC_KEY or "",
        "configured": fcm_service.is_vapid_configured,
        "fcm_configured": fcm_service.is_configured,
    }


@router.post("/push/subscribe")
def subscribe_web_push(
    data: PushSubscriptionRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    user_id = current_user.id if current_user else None
    existing = db.query(PushSubscription).filter(
        PushSubscription.endpoint == data.endpoint
    ).first()
    if existing:
        existing.user_id = user_id or existing.user_id
        existing.role = data.role
        existing.invite_code = data.invite_code.upper() if data.invite_code else existing.invite_code
        existing.p256dh = data.p256dh
        existing.auth = data.auth
    else:
        db.add(PushSubscription(
            user_id=user_id,
            role=data.role,
            invite_code=data.invite_code.upper() if data.invite_code else None,
            endpoint=data.endpoint,
            p256dh=data.p256dh,
            auth=data.auth,
        ))
    db.commit()
    return {"status": "subscribed", "push_status": fcm_service.get_status()}

