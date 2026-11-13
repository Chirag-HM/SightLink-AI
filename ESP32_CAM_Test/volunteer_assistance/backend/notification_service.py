import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from .config import settings
from .fcm import fcm_service
from .gmail_sender import build_alert_email, gmail_sender
from .models import (
    FamilyLink,
    FamilyShareSession,
    NotificationDeliveryLog,
    PushSubscription,
    TelegramLink,
    User,
)
from .privacy_crypto import get_session_last_coords, is_within_quiet_hours
from .telegram_bot import telegram_bot

logger = logging.getLogger("sightlink_notifications")


@dataclass
class AlertContext:
    blind_user_id: str
    blind_user_name: str
    first_name: str
    recipient_user_id: str
    recipient_name: str
    recipient_email: Optional[str]
    recipient_telegram_chat_id: Optional[str]
    invite_code: Optional[str]
    event_type: str
    title: str
    summary: str
    urgent: bool
    timestamp_str: str
    latitude: Optional[float]
    longitude: Optional[float]
    maps_url: Optional[str]
    track_url: Optional[str]
    battery_level: Optional[int]
    dedup_key: str
    extra: dict


@dataclass
class ChannelResult:
    channel: str
    status: str  # "sent" | "failed" | "skipped"
    destination_masked: str
    attempt_count: int = 1
    error_detail: Optional[str] = None


def _mask_email(email: Optional[str]) -> str:
    if not email or "@" not in email:
        return "none"
    local, domain = email.split("@", 1)
    prefix = local[:2] if len(local) >= 2 else local[:1]
    return f"{prefix}***@{domain}"


def _mask_chat(chat_id: Optional[str]) -> str:
    if not chat_id:
        return "none"
    s = str(chat_id)
    return f"tg:***{s[-4:]}" if len(s) > 4 else "tg:****"


class NotificationChannel:
    name: str = "base"

    async def send_once(self, ctx: AlertContext, db: Session) -> tuple[bool, Optional[str], str]:
        raise NotImplementedError


class EmailChannel(NotificationChannel):
    name = "email"

    async def send_once(self, ctx: AlertContext, db: Session) -> tuple[bool, Optional[str], str]:
        if not ctx.recipient_email:
            return False, "No recipient email address on account", "none"
        dest_mask = _mask_email(ctx.recipient_email)
        subject, html_body, text_body = build_alert_email(
            title=ctx.title,
            summary=ctx.summary,
            urgent=ctx.urgent,
            person_name=ctx.blind_user_name,
            timestamp_str=ctx.timestamp_str,
            maps_url=ctx.maps_url,
            track_url=ctx.track_url,
            battery_level=ctx.battery_level,
        )
        await gmail_sender.send_email(
            to_email=ctx.recipient_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
        )
        return True, None, dest_mask


class TelegramChannel(NotificationChannel):
    name = "telegram"

    async def send_once(self, ctx: AlertContext, db: Session) -> tuple[bool, Optional[str], str]:
        if not ctx.recipient_telegram_chat_id:
            return False, "Telegram not linked for this family member", "none"
        dest_mask = _mask_chat(ctx.recipient_telegram_chat_id)
        badge = "URGENT ALERT" if ctx.urgent else "SightLink Update"
        parts = [f"[{badge}] {ctx.title}", ctx.summary, f"Time: {ctx.timestamp_str}"]
        if ctx.battery_level is not None:
            parts.append(f"Battery: {ctx.battery_level}%")
        if ctx.maps_url:
            parts.append(f"Live Google Maps: {ctx.maps_url}")
        if ctx.track_url:
            parts.append(f"Family Dashboard: {ctx.track_url}")
        await telegram_bot.send_message(
            chat_id=ctx.recipient_telegram_chat_id,
            text="\n".join(parts),
            button_url=ctx.maps_url or ctx.track_url,
        )
        return True, None, dest_mask


class WebPushChannel(NotificationChannel):
    name = "web_push"

    async def send_once(self, ctx: AlertContext, db: Session) -> tuple[bool, Optional[str], str]:
        subs_q = db.query(PushSubscription).filter(PushSubscription.user_id == ctx.recipient_user_id)
        subs = subs_q.all()
        if not subs and ctx.invite_code:
            subs = db.query(PushSubscription).filter(PushSubscription.invite_code == ctx.invite_code).all()

        if not subs:
            return False, "No active Web Push subscription", "push:none"

        sent_any = False
        last_err = None
        for sub in subs:
            if sub.p256dh and sub.auth:
                res = fcm_service.send_web_push(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    payload={
                        "title": ctx.title,
                        "body": ctx.summary,
                        "tag": ctx.event_type,
                        "url": f"/family/track/{ctx.invite_code}" if ctx.invite_code else "/family/track",
                        "data": {
                            "url": f"/family/track/{ctx.invite_code}" if ctx.invite_code else "/family/track",
                            "maps_url": ctx.maps_url,
                            "urgent": ctx.urgent,
                            **(ctx.extra or {}),
                        },
                    },
                )
                if isinstance(res, dict) and res.get("success") is True:
                    sent_any = True
                elif isinstance(res, dict):
                    err_code = res.get("error")
                    if err_code in ("VAPID_NOT_CONFIGURED", "PYWEBPUSH_NOT_INSTALLED"):
                        last_err = f"No active VAPID push: {res.get('detail') or err_code}"
                    else:
                        last_err = res.get("detail") or err_code or "Web Push failed"
                else:
                    last_err = "VAPID Web Push keys unset or push gateway rejected payload"
            else:
                last_err = "Local/incomplete push subscription"

        if sent_any:
            return True, None, f"push:{len(subs)}_sub"
        return False, last_err or "Web Push failed", f"push:{len(subs)}_sub"


def _event_preference_allowed(link: FamilyLink, event_type: str, category: str, urgent: bool) -> bool:
    if link.status != "approved":
        return False

    if event_type in ("SOS_TRIGGERED", "FALL_DETECTED"):
        return bool(getattr(link, "receive_sos", True))
    if event_type in ("NO_VOLUNTEER_AVAILABLE", "HELP_REQUEST_ESCALATED_SOS", "LIVE_ASSIST_NO_JOIN_FALLBACK"):
        return bool(getattr(link, "receive_no_volunteer", True))
    if event_type in ("HELP_REQUEST_ACCEPTED", "LIVE_ASSIST_CONNECTED"):
        return bool(getattr(link, "receive_volunteer_accepted", True)) and bool(link.share_help_requests)
    if event_type in ("HELP_REQUEST_COMPLETED", "LIVE_ASSIST_ENDED"):
        return bool(getattr(link, "receive_help_completed", True)) and bool(link.share_help_requests)
    if event_type in ("PLACE_ARRIVAL", "PLACE_DEPARTURE", "GEOFENCE_EXIT_ALERT"):
        return bool(getattr(link, "receive_place_arrival", True)) and bool(link.share_arrival_departure)
    if category == "help_request":
        return bool(link.share_help_requests)
    if category in ("unusual_route", "long_stop"):
        return bool(link.share_unusual_route)
    if category == "arrival_departure":
        return bool(link.share_arrival_departure)
    return urgent or True


class MultiChannelNotificationService:
    def __init__(self):
        self.channels: dict[str, NotificationChannel] = {
            "email": EmailChannel(),
            "telegram": TelegramChannel(),
            "web_push": WebPushChannel(),
        }
        self._retry_delays: tuple[float, ...] = (0.35, 0.9)

    def set_retry_delays(self, delays: tuple[float, ...]) -> None:
        self._retry_delays = delays

    async def _deliver_with_retry(self, channel: NotificationChannel, ctx: AlertContext, db: Session) -> ChannelResult:
        # De-duplication per recipient + channel + dedup_key within active dedup window
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=max(60, settings.ALERT_GROUP_WINDOW_SECONDS))
        duplicate = (
            db.query(NotificationDeliveryLog)
            .filter(
                NotificationDeliveryLog.dedup_key == ctx.dedup_key,
                NotificationDeliveryLog.channel == channel.name,
                NotificationDeliveryLog.status == "sent",
                NotificationDeliveryLog.created_at >= cutoff,
            )
            .first()
        )
        if duplicate:
            return ChannelResult(
                channel=channel.name,
                status="skipped",
                destination_masked=duplicate.destination_masked or "dedup",
                attempt_count=0,
                error_detail="Deduplicated within repeat window",
            )

        attempts = 0
        max_attempts = 1 + len(self._retry_delays)
        last_err: Optional[str] = None
        dest_mask = "none"

        for idx in range(max_attempts):
            attempts += 1
            try:
                ok, err, dest_mask = await channel.send_once(ctx, db)
                if ok:
                    return ChannelResult(
                        channel=channel.name,
                        status="sent",
                        destination_masked=dest_mask,
                        attempt_count=attempts,
                    )
                last_err = err or f"{channel.name} unavailable"
                # Do not retry deterministic missing destination ("No recipient ...")
                if "No recipient" in last_err or "not linked" in last_err or "No active" in last_err:
                    return ChannelResult(
                        channel=channel.name,
                        status="skipped",
                        destination_masked=dest_mask,
                        attempt_count=1,
                        error_detail=last_err,
                    )
            except Exception as exc:
                last_err = str(exc)[:300]
                if channel.name == "email":
                    dest_mask = _mask_email(ctx.recipient_email)
                elif channel.name == "telegram":
                    dest_mask = _mask_chat(ctx.recipient_telegram_chat_id)

            if idx < len(self._retry_delays) and self._retry_delays[idx] > 0:
                await asyncio.sleep(self._retry_delays[idx])

        return ChannelResult(
            channel=channel.name,
            status="failed",
            destination_masked=dest_mask,
            attempt_count=attempts,
            error_detail=last_err,
        )

    async def dispatch_family_alert(
        self,
        db: Session,
        blind_user_id: str,
        *,
        event_type: str,
        category: str,
        title: str,
        summary: str,
        urgent: bool = False,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        battery_level: Optional[int] = None,
        dedup_entity: Optional[str] = None,
        extra: Optional[dict] = None,
    ) -> list[dict]:
        now = datetime.now(timezone.utc)
        blind_user = db.query(User).filter(User.id == blind_user_id).first()
        if not blind_user:
            return []

        session = db.query(FamilyShareSession).filter(
            FamilyShareSession.blind_user_id == blind_user_id
        ).first()

        # Respect sharing pause for non-urgent updates (urgent SOS / no-volunteer bypass pause & quiet hours)
        if session and not urgent and session.is_paused:
            return []

        if session and not urgent and is_within_quiet_hours(
            bool(session.quiet_hours_enabled),
            session.quiet_hours_start,
            session.quiet_hours_end,
            session.quiet_hours_tz_offset_min or 0,
            now_utc=now,
        ):
            return []

        lat, lng = latitude, longitude
        if (lat is None or lng is None) and session:
            coords = get_session_last_coords(session)
            if coords:
                lat, lng = coords[0], coords[1]

        bat = battery_level if battery_level is not None else (session.battery_level if session else None)
        maps_url = (extra or {}).get("maps_url") or (
            f"https://maps.google.com/?q={lat:.6f},{lng:.6f}" if (lat is not None and lng is not None) else None
        )
        track_url = f"{settings.APP_PUBLIC_URL}/family/track/{session.invite_code}" if (session and session.invite_code) else f"{settings.APP_PUBLIC_URL}/family/track"
        timestamp_str = now.strftime("%Y-%m-%d %H:%M:%S UTC")

        links = db.query(FamilyLink).filter(
            FamilyLink.blind_user_id == blind_user_id,
            FamilyLink.status == "approved",
        ).all()

        results_summary = []
        dedup_scope = dedup_entity or now.strftime("%Y%m%d%H%M")
        first_name = (blind_user.full_name or "User").strip().split()[0]

        for lnk in links:
            if not _event_preference_allowed(lnk, event_type, category, urgent):
                continue

            fam_user = db.query(User).filter(User.id == lnk.family_user_id).first()
            if not fam_user:
                continue

            tg_link = db.query(TelegramLink).filter(
                TelegramLink.user_id == fam_user.id,
                TelegramLink.is_active == True,
            ).first()

            dedup_key = f"{blind_user_id}:{fam_user.id}:{event_type}:{dedup_scope}"

            ctx = AlertContext(
                blind_user_id=blind_user_id,
                blind_user_name=blind_user.full_name or "SightLink User",
                first_name=first_name,
                recipient_user_id=fam_user.id,
                recipient_name=fam_user.full_name or "Family Member",
                recipient_email=fam_user.email,
                recipient_telegram_chat_id=(tg_link.chat_id if tg_link and tg_link.chat_id else None),
                invite_code=session.invite_code if session else None,
                event_type=event_type,
                title=title,
                summary=summary,
                urgent=urgent,
                timestamp_str=timestamp_str,
                latitude=lat,
                longitude=lng,
                maps_url=maps_url,
                track_url=track_url,
                battery_level=bat,
                dedup_key=dedup_key,
                extra=extra or {},
            )

            enabled_channels: list[NotificationChannel] = []
            if getattr(lnk, "notify_email", True):
                enabled_channels.append(self.channels["email"])
            if getattr(lnk, "notify_telegram", True):
                enabled_channels.append(self.channels["telegram"])
            if getattr(lnk, "notify_web_push", True):
                enabled_channels.append(self.channels["web_push"])

            # Execute enabled channels in parallel so one channel failing never blocks others
            channel_outcomes = await asyncio.gather(
                *(self._deliver_with_retry(ch, ctx, db) for ch in enabled_channels),
                return_exceptions=True,
            )

            for idx, outcome in enumerate(channel_outcomes):
                ch_name = enabled_channels[idx].name
                if isinstance(outcome, Exception):
                    res = ChannelResult(
                        channel=ch_name,
                        status="failed",
                        destination_masked="unknown",
                        attempt_count=1,
                        error_detail=str(outcome)[:300],
                    )
                else:
                    res = outcome

                # Persist non-skipped attempts + failed errors to delivery log
                if res.status != "skipped" or res.error_detail != "Deduplicated within repeat window":
                    log_row = NotificationDeliveryLog(
                        blind_user_id=blind_user_id,
                        recipient_user_id=fam_user.id,
                        event_type=event_type,
                        dedup_key=dedup_key,
                        channel=res.channel,
                        destination_masked=res.destination_masked,
                        status=res.status,
                        attempt_count=res.attempt_count,
                        error_detail=res.error_detail,
                        created_at=now,
                    )
                    db.add(log_row)

                results_summary.append({
                    "recipient_user_id": fam_user.id,
                    "recipient_scope": "family",
                    "channel": res.channel,
                    "destination": res.destination_masked,
                    "status": res.status,
                    "attempt_count": res.attempt_count,
                    "error": res.error_detail,
                })

        # Self-notification delivery:
        # - Always dispatch to blind user's own active Telegram chat on urgent alerts or SOS/geofence safety events
        # - When NO approved family guardians exist yet on an urgent event, also send a self-confirmation email
        self_safety_events = {
            "SOS_TRIGGERED",
            "SOS_RESOLVED",
            "FALL_DETECTED",
            "NO_VOLUNTEER_AVAILABLE",
            "HELP_REQUEST_ESCALATED_SOS",
            "LIVE_ASSIST_NO_JOIN_FALLBACK",
            "GEOFENCE_EXIT_ALERT",
        }
        self_tg = (
            db.query(TelegramLink)
            .filter(TelegramLink.user_id == blind_user_id, TelegramLink.is_active == True)
            .first()
        )
        send_self_tg = bool(self_tg and self_tg.chat_id and (urgent or event_type in self_safety_events))
        send_self_email = bool(urgent and len(links) == 0 and blind_user.email_verified and blind_user.email)

        if send_self_tg or send_self_email:
            self_dedup_key = f"{blind_user_id}:self:{event_type}:{dedup_scope}"
            no_guardian_hint = (
                " (No approved family guardians linked yet — add a guardian in Contacts so family members also receive instant alerts.)"
                if len(links) == 0 and urgent
                else ""
            )
            self_ctx = AlertContext(
                blind_user_id=blind_user_id,
                blind_user_name=blind_user.full_name or "SightLink User",
                first_name=first_name,
                recipient_user_id=blind_user_id,
                recipient_name=blind_user.full_name or "SightLink User",
                recipient_email=blind_user.email if send_self_email else None,
                recipient_telegram_chat_id=(self_tg.chat_id if send_self_tg else None),
                invite_code=session.invite_code if session else None,
                event_type=event_type,
                title=f"{title} (Self-Alert)" if "(Self-Alert)" not in title else title,
                summary=f"{summary}{no_guardian_hint}",
                urgent=urgent,
                timestamp_str=timestamp_str,
                latitude=lat,
                longitude=lng,
                maps_url=maps_url,
                track_url=track_url,
                battery_level=bat,
                dedup_key=self_dedup_key,
                extra=extra or {},
            )
            self_channels: list[NotificationChannel] = []
            if send_self_email:
                self_channels.append(self.channels["email"])
            if send_self_tg:
                self_channels.append(self.channels["telegram"])

            self_outcomes = await asyncio.gather(
                *(self._deliver_with_retry(ch, self_ctx, db) for ch in self_channels),
                return_exceptions=True,
            )
            for idx, outcome in enumerate(self_outcomes):
                ch_name = self_channels[idx].name
                if isinstance(outcome, Exception):
                    res = ChannelResult(
                        channel=ch_name,
                        status="failed",
                        destination_masked="unknown",
                        attempt_count=1,
                        error_detail=str(outcome)[:300],
                    )
                else:
                    res = outcome

                if res.status != "skipped" or res.error_detail != "Deduplicated within repeat window":
                    db.add(NotificationDeliveryLog(
                        blind_user_id=blind_user_id,
                        recipient_user_id=blind_user_id,
                        event_type=event_type,
                        dedup_key=self_dedup_key,
                        channel=res.channel,
                        destination_masked=res.destination_masked,
                        status=res.status,
                        attempt_count=res.attempt_count,
                        error_detail=res.error_detail,
                        created_at=now,
                    ))

                results_summary.append({
                    "recipient_user_id": blind_user_id,
                    "recipient_scope": "self",
                    "channel": res.channel,
                    "destination": res.destination_masked,
                    "status": res.status,
                    "attempt_count": res.attempt_count,
                    "error": res.error_detail,
                })

        db.commit()
        return results_summary


notification_service = MultiChannelNotificationService()
