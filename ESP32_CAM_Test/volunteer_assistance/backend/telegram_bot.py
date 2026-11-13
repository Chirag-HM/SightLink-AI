import asyncio
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Optional
from urllib.parse import quote

import requests
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from .auth import get_current_user
from .config import settings
from .database import SessionLocal, get_db
from .models import TelegramLink, User

logger = logging.getLogger("sightlink_telegram")

router = APIRouter(prefix="/api/telegram", tags=["Telegram Bot Alerts"])


class TelegramBotService:
    def __init__(self):
        self._sender_override: Optional[Callable[[str, str, Optional[str]], Awaitable[bool] | bool]] = None
        self._last_update_offset: int = 0
        self._poll_lock: Optional[asyncio.Lock] = None
        self._poll_lock_loop: Optional[asyncio.AbstractEventLoop] = None

    def get_poll_lock(self) -> asyncio.Lock:
        loop = asyncio.get_running_loop()
        if self._poll_lock is None or self._poll_lock_loop is not loop:
            self._poll_lock = asyncio.Lock()
            self._poll_lock_loop = loop
        return self._poll_lock

    @property
    def is_configured(self) -> bool:
        return bool((settings.TELEGRAM_BOT_TOKEN or "").strip())

    @property
    def bot_username(self) -> str:
        raw = (settings.TELEGRAM_BOT_USERNAME or "").strip().lstrip("@")
        return raw or "SightLinkAlertBot"

    def set_sender_override(
        self, fn: Optional[Callable[[str, str, Optional[str]], Awaitable[bool] | bool]]
    ) -> None:
        self._sender_override = fn

    def _send_sync(self, chat_id: str, text: str, button_url: Optional[str] = None) -> bool:
        token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
        if not token:
            raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured.")
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload: dict = {
            "chat_id": str(chat_id),
            "text": text,
            "disable_web_page_preview": False,
        }
        if button_url:
            payload["reply_markup"] = {
                "inline_keyboard": [[{"text": "View live location", "url": button_url}]]
            }
        resp = requests.post(url, json=payload, timeout=8)
        if not resp.ok:
            raise RuntimeError(f"Telegram Bot API HTTP {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        if not data.get("ok"):
            raise RuntimeError(f"Telegram API error: {data}")
        return True

    async def send_message(self, *, chat_id: str, text: str, button_url: Optional[str] = None) -> bool:
        if self._sender_override is not None:
            res = self._sender_override(str(chat_id), text, button_url)
            if asyncio.iscoroutine(res):
                return bool(await res)
            return bool(res)
        return await asyncio.to_thread(self._send_sync, str(chat_id), text, button_url)


telegram_bot = TelegramBotService()


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _mask_chat_id(chat_id: Optional[str]) -> Optional[str]:
    if not chat_id:
        return None
    s = str(chat_id)
    if len(s) <= 4:
        return "****"
    return f"***{s[-4:]}"


def _extract_connect_token_from_text(text: str, db: Session) -> tuple[bool, str]:
    """
    Detect explicit /start, /connect, /link commands, pasted t.me?start=... URLs,
    or bare one-time connect tokens pasted directly into chat.
    Returns (is_connect_attempt, token).
    """
    clean = (text or "").strip()
    if not clean:
        return False, ""

    cmd_match = re.match(r"^/(?:start|connect|link)(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?$", clean, re.IGNORECASE)
    if cmd_match:
        arg = (cmd_match.group(1) or "").strip()
        url_match = re.search(r"[?&]start=([A-Za-z0-9_-]{8,96})", arg)
        return True, (url_match.group(1) if url_match else arg)

    url_match = re.search(r"https?://t\.me/[^\s?#]+\?[^\s#]*\bstart=([A-Za-z0-9_-]{8,96})", clean)
    if url_match:
        return True, url_match.group(1)

    if re.fullmatch(r"[A-Za-z0-9_-]{16,96}", clean):
        exists = db.query(TelegramLink.id).filter(TelegramLink.connect_token == clean).first()
        if exists:
            return True, clean

    return False, ""


async def process_telegram_update(db: Session, update: dict) -> dict:
    msg = update.get("message") or update.get("edited_message") or {}
    chat = msg.get("chat") or {}
    chat_id = chat.get("id")
    text = (msg.get("text") or "").strip()
    from_user = msg.get("from") or {}
    tg_username = from_user.get("username") or chat.get("username")

    if not chat_id or not text:
        return {"handled": False}

    chat_str = str(chat_id)
    now = datetime.now(timezone.utc)

    is_connect, token = _extract_connect_token_from_text(text, db)
    if is_connect:
        if not token:
            db.rollback()
            if telegram_bot.is_configured or telegram_bot._sender_override:
                await telegram_bot.send_message(
                    chat_id=chat_str,
                    text=(
                        "Welcome to SightLink AI Alerts. Tap 'Connect Telegram' in SightLink Settings "
                        "to link your account, or paste your '/start <token>' code here."
                    ),
                )
            return {"handled": True, "action": "start_missing_token"}

        link = (
            db.query(TelegramLink)
            .filter(TelegramLink.connect_token == token)
            .first()
        )
        exp = _as_utc(link.token_expires_at) if link else None
        if not link or link.token_used or (exp and exp < now):
            db.rollback()
            if telegram_bot.is_configured or telegram_bot._sender_override:
                await telegram_bot.send_message(
                    chat_id=chat_str,
                    text="This connect link is invalid or expired. Generate a fresh link in SightLink Settings.",
                )
            return {"handled": True, "action": "invalid_token"}

        link.chat_id = chat_str
        link.telegram_username = tg_username
        link.is_active = True
        link.token_used = True
        link.connected_at = now
        link.updated_at = now
        db.commit()

        reply = "Connected. You'll get alerts here."
        if telegram_bot.is_configured or telegram_bot._sender_override:
            await telegram_bot.send_message(chat_id=chat_str, text=reply)
        return {"handled": True, "action": "connected", "user_id": link.user_id, "reply": reply}

    if text.lower().startswith("/stop"):
        links = db.query(TelegramLink).filter(TelegramLink.chat_id == chat_str).all()
        for lnk in links:
            lnk.is_active = False
            lnk.updated_at = now
        db.commit()
        reply = "Alerts stopped. You can reconnect anytime in SightLink Settings."
        if telegram_bot.is_configured or telegram_bot._sender_override:
            await telegram_bot.send_message(chat_id=chat_str, text=reply)
        return {"handled": True, "action": "stopped", "count": len(links), "reply": reply}

    return {"handled": False}


async def poll_telegram_updates_once(timeout_sec: float = 8.0) -> int:
    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    if not token:
        return 0
    async with telegram_bot.get_poll_lock():
        url = f"https://api.telegram.org/bot{token}/getUpdates"
        resp = await asyncio.to_thread(
            requests.get,
            url,
            params={"offset": telegram_bot._last_update_offset, "timeout": 0, "limit": 25},
            timeout=timeout_sec,
        )
        if not resp.ok:
            return 0
        data = resp.json()
        updates = data.get("result") or []
        if not updates:
            return 0

        db = SessionLocal()
        processed = 0
        try:
            for upd in updates:
                uid = upd.get("update_id")
                if isinstance(uid, int):
                    telegram_bot._last_update_offset = max(telegram_bot._last_update_offset, uid + 1)
                await process_telegram_update(db, upd)
                processed += 1
        finally:
            db.close()
        return processed


@router.post("/connect-link")
def create_telegram_connect_link(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(20)
    expires = now + timedelta(minutes=30)

    link = db.query(TelegramLink).filter(TelegramLink.user_id == current_user.id).first()
    if not link:
        link = TelegramLink(
            user_id=current_user.id,
            connect_token=token,
            token_expires_at=expires,
            token_used=False,
            is_active=False,
            updated_at=now,
        )
        db.add(link)
    else:
        link.connect_token = token
        link.token_expires_at = expires
        link.token_used = False
        link.updated_at = now
    db.commit()

    bot_username = telegram_bot.bot_username
    deep_link = f"https://t.me/{bot_username}?start={token}"
    tg_uri = f"tg://resolve?domain={bot_username}&start={token}"
    web_url = f"https://web.telegram.org/k/#?tgaddr={quote(tg_uri, safe='')}"
    web_chat_url = f"https://web.telegram.org/k/#@{bot_username}"
    return {
        "connect_url": deep_link,
        "web_url": web_url,
        "web_chat_url": web_chat_url,
        "tg_uri": tg_uri,
        "start_command": f"/start {token}",
        "token": token,
        "bot_username": bot_username,
        "configured": telegram_bot.is_configured,
        "expires_in_seconds": 1800,
        "instructions": f"Open Telegram (App, Web, or QR) and send '/start {token}' to @{bot_username}.",
    }


@router.get("/status")
async def get_telegram_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid = current_user.id
    link = db.query(TelegramLink).filter(TelegramLink.user_id == uid).first()
    if (
        not (link and link.is_active and link.chat_id)
        and link is not None
        and link.connect_token
        and not link.token_used
        and settings.TELEGRAM_USE_POLLING
        and telegram_bot.is_configured
    ):
        db.rollback()
        try:
            await poll_telegram_updates_once(timeout_sec=3.5)
        except Exception as exc:
            logger.debug("On-demand telegram status poll skipped: %s", exc)
        db.expire_all()
        link = db.query(TelegramLink).filter(TelegramLink.user_id == uid).first()

    return {
        "connected": bool(link and link.is_active and link.chat_id),
        "is_active": bool(link and link.is_active),
        "telegram_username": link.telegram_username if (link and link.is_active) else None,
        "chat_id_masked": _mask_chat_id(link.chat_id) if (link and link.is_active) else None,
        "bot_username": telegram_bot.bot_username,
        "configured": telegram_bot.is_configured,
        "connected_at": (_as_utc(link.connected_at).isoformat() if link and link.connected_at else None),
    }


@router.post("/disconnect")
def disconnect_telegram(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    link = db.query(TelegramLink).filter(TelegramLink.user_id == current_user.id).first()
    if link:
        link.is_active = False
        link.chat_id = None
        link.connect_token = None
        link.token_used = True
        link.updated_at = datetime.now(timezone.utc)
        db.commit()
    return {"status": "disconnected", "connected": False}


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_telegram_bot_api_secret_token: Optional[str] = Header(default=None),
):
    expected = (settings.TELEGRAM_WEBHOOK_SECRET or "").strip()
    if expected and not secrets.compare_digest(x_telegram_bot_api_secret_token or "", expected):
        raise HTTPException(status_code=403, detail="Invalid Telegram webhook secret.")
    update = await request.json()
    result = await process_telegram_update(db, update)
    return {"ok": True, **result}

