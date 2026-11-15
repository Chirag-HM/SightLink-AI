import asyncio
import logging
import smtplib
from email.message import EmailMessage
from html import escape
from typing import Awaitable, Callable, Optional

from .config import settings

logger = logging.getLogger("sightlink_gmail")


def build_verification_email(*, full_name: str, code: str, expire_minutes: int = 10) -> tuple[str, str, str]:
    safe_name = escape(full_name or "there")
    safe_code = escape(code)
    subject = f"{code} is your SightLink AI verification code"

    text_body = (
        f"Hello {full_name or 'there'},\n\n"
        f"Your SightLink AI email verification code is: {code}\n\n"
        f"This code expires in {expire_minutes} minutes and can only be used once.\n"
        f"If you did not request this code, you can safely ignore this message.\n"
    )

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px;background:#FAF7F0;font-family:Inter,Arial,sans-serif;color:#12231B;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #DCD2BF;border-radius:18px;overflow:hidden;">
    <tr>
      <td style="background:#065F46;padding:22px 28px;color:#FFFFFF;">
        <p style="margin:0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#FBF3DF;">SIGHTLINK AI</p>
        <h1 style="margin:6px 0 0;font-size:22px;line-height:1.3;">Verify Your Email Address</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Hello <strong>{safe_name}</strong>,</p>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#354B40;">
          Enter this 6-digit verification code in SightLink AI to activate SOS alerts and volunteer assistance features:
        </p>
        <div style="margin:0 0 22px;padding:18px;border-radius:14px;background:#ECF7F2;border:1px solid #065F46;text-align:center;">
          <span style="font-family:monospace;font-size:32px;font-weight:800;letter-spacing:8px;color:#065F46;">{safe_code}</span>
        </div>
        <p style="margin:0 0 8px;font-size:13px;color:#4F6358;">
          This code expires in <strong>{expire_minutes} minutes</strong>. Up to 5 verification attempts are allowed per code.
        </p>
        <p style="margin:0;font-size:12px;color:#697D72;">
          If you did not create a SightLink AI account, please ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return subject, html_body, text_body


def build_alert_email(
    *,
    title: str,
    summary: str,
    urgent: bool,
    person_name: str,
    timestamp_str: str,
    maps_url: Optional[str] = None,
    track_url: Optional[str] = None,
    battery_level: Optional[int] = None,
) -> tuple[str, str, str]:
    action_url = maps_url or track_url or settings.APP_PUBLIC_URL
    badge = "URGENT SAFETY ALERT" if urgent else "Calm Family Update"
    header_bg = "#B91C1C" if urgent else "#065F46"
    pill_bg = "#FEE2E2" if urgent else "#ECF7F2"
    pill_fg = "#991B1B" if urgent else "#065F46"

    lines = [
        f"[{badge}] {title}",
        "",
        f"Person: {person_name}",
        f"Details: {summary}",
        f"Time: {timestamp_str}",
    ]
    if battery_level is not None:
        lines.append(f"Battery: {battery_level}%")
    if maps_url:
        lines.append(f"Live Google Maps Location: {maps_url}")
    if track_url:
        lines.append(f"SightLink Family View: {track_url}")
    lines.append("")
    lines.append(f"View live location: {action_url}")
    text_body = "\n".join(lines)

    battery_html = (
        f'<p style="margin:6px 0;font-size:14px;color:#354B40;"><strong>Battery:</strong> {int(battery_level)}%</p>'
        if battery_level is not None
        else ""
    )
    track_html = (
        f'<p style="margin:12px 0 0;font-size:13px;"><a href="{escape(track_url)}" style="color:#065F46;">Open Read-Only SightLink Family Timeline</a></p>'
        if track_url
        else ""
    )

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px;background:#FAF7F0;font-family:Inter,Arial,sans-serif;color:#12231B;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;margin:0 auto;background:#FFFFFF;border:1px solid #DCD2BF;border-radius:18px;overflow:hidden;">
    <tr>
      <td style="background:{header_bg};padding:20px 28px;color:#FFFFFF;">
        <p style="margin:0;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;">{escape(badge)}</p>
        <h1 style="margin:6px 0 0;font-size:21px;line-height:1.3;">{escape(title)}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:26px 28px;">
        <div style="display:inline-block;padding:5px 12px;border-radius:999px;background:{pill_bg};color:{pill_fg};font-size:12px;font-weight:700;margin-bottom:14px;">
          {escape(person_name)}
        </div>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#12231B;"><strong>{escape(summary)}</strong></p>
        <p style="margin:6px 0;font-size:14px;color:#354B40;"><strong>Time:</strong> {escape(timestamp_str)}</p>
        {battery_html}
        <div style="margin:22px 0 8px;">
          <a href="{escape(action_url)}" style="display:inline-block;padding:14px 24px;background:#065F46;color:#FFFFFF;text-decoration:none;font-weight:700;border-radius:999px;font-size:15px;">
            View live location
          </a>
        </div>
        {track_html}
      </td>
    </tr>
  </table>
</body>
</html>"""
    subject = f"{'URGENT: ' if urgent else ''}{title} — {person_name}"
    return subject, html_body, text_body


class GmailSender:
    def __init__(self):
        self._transport_override: Optional[Callable[[str, str, str, str], Awaitable[None] | None]] = None

    @property
    def is_configured(self) -> bool:
        return bool(
            (settings.GMAIL_USER or "").strip()
            and "".join((settings.GMAIL_APP_PASSWORD or "").split())
        )

    def set_transport_override(self, fn: Optional[Callable[[str, str, str, str], Awaitable[None] | None]]) -> None:
        self._transport_override = fn

    def _send_smtp_sync(self, to_email: str, subject: str, html_body: str, text_body: str) -> None:
        gmail_user = (settings.GMAIL_USER or "").strip()
        gmail_pass = "".join((settings.GMAIL_APP_PASSWORD or "").split())
        if not gmail_user or not gmail_pass:
            raise RuntimeError("Gmail SMTP credentials (GMAIL_USER / GMAIL_APP_PASSWORD) are not configured.")

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = f"{settings.GMAIL_FROM_NAME} <{gmail_user}>"
        msg["To"] = to_email
        msg.set_content(text_body)
        msg.add_alternative(html_body, subtype="html")

        def _deliver(server):
            server.ehlo()
            server.login(gmail_user, gmail_pass)
            server.send_message(msg)

        try:
            with smtplib.SMTP("smtp.gmail.com", 587, timeout=12) as server:
                server.ehlo()
                server.starttls()
                _deliver(server)
        except smtplib.SMTPAuthenticationError:
            raise
        except (OSError, smtplib.SMTPException) as primary_exc:
            logger.warning("Gmail STARTTLS (587) failed (%s); retrying SSL on port 465.", primary_exc)
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=12) as ssl_server:
                _deliver(ssl_server)

    async def send_email(self, *, to_email: str, subject: str, html_body: str, text_body: str) -> str:
        if self._transport_override is not None:
            res = self._transport_override(to_email, subject, html_body, text_body)
            if asyncio.iscoroutine(res):
                await res
            return "override"

        await asyncio.to_thread(self._send_smtp_sync, to_email, subject, html_body, text_body)
        return "smtp"


gmail_sender = GmailSender()

