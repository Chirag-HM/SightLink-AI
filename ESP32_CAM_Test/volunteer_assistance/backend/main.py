import asyncio
import hmac
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .config import settings
from .database import SessionLocal, run_migrations
from .models import (
    AssistanceRequest, RequestStatus,
    LiveAssistSession, LiveAssistStatus,
    FamilyShareSession,
)
from .websockets import notification_hub
from .fcm import fcm_service
from .family_events import prune_expired_location_history, emit_calm_family_event

from .routes.auth_routes import router as auth_router
from .routes.volunteer_routes import router as volunteer_router
from .routes.assistance_routes import router as assistance_router, escalate_request_step
from .routes.live_assist_routes import router as live_assist_router, escalate_live_assist_step
from .routes.stick_routes import router as stick_router, hardware_router, monitor_esp8266_stick
from .routes.family_routes import router as family_router
from .routes.safety_routes import router as safety_router
from .routes.bmtc_routes import router as bmtc_router
from .routes.bus_routes import router as bus_router
from .routes.assistant_routes import (
    router as assistant_router,
    process_hardware_button_event,
)
from .routes.health_routes import router as health_router
from .schemas import HardwareButtonEventRequest
from .telegram_bot import router as telegram_router, poll_telegram_updates_once, telegram_bot
from .gmail_sender import gmail_sender

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("volunteer_assistance_app")


def safe_run_migrations():
    """Run database table creation with retries so startup never crashes on transient DB delays."""
    import time
    for attempt in range(1, 6):
        try:
            logger.info("Initializing database schema (attempt %d/5)...", attempt)
            run_migrations()
            logger.info("Database schema initialized successfully.")
            return
        except Exception as exc:
            logger.warning("Database schema init attempt %d failed (%s); retrying in 2s...", attempt, exc)
            time.sleep(2)
    logger.error("Database schema init encountered errors; continuing so web server remains reachable.")


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


# ── Background Task: Staged Escalation (500m -> 1km -> 3km -> Family & SOS) + Expiration ──
async def monitor_assistance_requests():
    """Periodically check pending requests for 60s radius escalation and final timeout."""
    while True:
        try:
            await asyncio.sleep(5)
            db: Session = SessionLocal()
            try:
                now = datetime.now(timezone.utc)
                pending_requests = db.query(AssistanceRequest).filter(
                    AssistanceRequest.status == RequestStatus.PENDING
                ).all()

                for req in pending_requests:
                    created = _as_utc(req.created_at) or now
                    last_step_at = _as_utc(req.last_escalated_at) or created

                    # Escalate every ESCALATION_STEP_SECONDS (default 60s) up to stage 3
                    if (req.escalation_stage or 0) < 3 and (now - last_step_at).total_seconds() >= settings.ESCALATION_STEP_SECONDS:
                        await escalate_request_step(db, req)

                    # Final expiration after REQUEST_TIMEOUT_SECONDS (default 300s)
                    if (now - created).total_seconds() >= settings.REQUEST_TIMEOUT_SECONDS:
                        req.status = RequestStatus.EXPIRED
                        db.commit()
                        logger.info(f"Assistance request {req.id} expired due to timeout.")
                        await notification_hub.send_to_user(req.blind_user_id, {
                            "type": "REQUEST_EXPIRED",
                            "request_id": req.id,
                            "status": RequestStatus.EXPIRED.value,
                            "message": "Your request timed out without an available volunteer. Family contacts have been notified and SOS is ready."
                        })

                # Eyes on Demand: staged 15s radius widening (1km -> 3km -> 10km+remote) + 45s family/SOS fallback
                waiting_live = db.query(LiveAssistSession).filter(
                    LiveAssistSession.status == LiveAssistStatus.WAITING
                ).all()
                for ls in waiting_live:
                    ls_created = _as_utc(ls.created_at) or now
                    ls_last = _as_utc(ls.last_escalated_at) or ls_created
                    elapsed_total = (now - ls_created).total_seconds()
                    elapsed_step = (now - ls_last).total_seconds()
                    if (ls.escalation_stage or 0) < 2 and elapsed_step >= settings.LIVE_ASSIST_ESCALATION_STEP_SECONDS:
                        await escalate_live_assist_step(db, ls)
                    elif (ls.escalation_stage or 0) == 2 and elapsed_total >= settings.LIVE_ASSIST_NO_JOIN_FALLBACK_SECONDS:
                        await escalate_live_assist_step(db, ls)
                    elif elapsed_total >= settings.REQUEST_TIMEOUT_SECONDS:
                        ls.status = LiveAssistStatus.ENDED
                        ls.outcome = ls.outcome or "timeout"
                        ls.ended_at = now
                        db.commit()

                # Eyes on Demand: notify peers cleanly when connected timer reaches 0 (extendable anytime)
                connected_live = db.query(LiveAssistSession).filter(
                    LiveAssistSession.status == LiveAssistStatus.CONNECTED
                ).all()
                for ls in connected_live:
                    exp = _as_utc(ls.expires_at)
                    if exp and now >= exp:
                        ls.status = LiveAssistStatus.ENDED
                        ls.outcome = ls.outcome or "completed"
                        ls.ended_at = now
                        db.commit()
                        await emit_calm_family_event(
                            db,
                            ls.blind_user_id,
                            event_type="LIVE_ASSIST_ENDED",
                            category="help_request",
                            title="Help Session Finished Safely",
                            summary="Help session finished safely",
                            urgent=False,
                            metadata={"session_id": ls.id, "outcome": ls.outcome},
                        )
                        end_msg = {
                            "type": "LIVE_ASSIST_ENDED",
                            "session_id": ls.id,
                            "outcome": ls.outcome,
                            "voice_announcement": "Live video timer finished safely.",
                        }
                        await notification_hub.send_to_user(ls.blind_user_id, end_msg)
                        if ls.accepted_by_id:
                            await notification_hub.send_to_user(ls.accepted_by_id, end_msg)

                # Calm Family Updates: auto-resume expired 1-hour pauses + enforce 7-day raw retention
                paused_sessions = db.query(FamilyShareSession).filter(
                    FamilyShareSession.is_paused == True,
                    FamilyShareSession.paused_until.isnot(None),
                ).all()
                for fs in paused_sessions:
                    pu = _as_utc(fs.paused_until)
                    if pu and pu <= now:
                        fs.is_paused = False
                        fs.paused_until = None
                        fs.updated_at = now
                        db.commit()

                prune_expired_location_history(db)
            finally:
                db.close()

            if settings.TELEGRAM_USE_POLLING and telegram_bot.is_configured:
                try:
                    await poll_telegram_updates_once()
                except Exception as poll_err:
                    logger.debug("Telegram polling check skipped: %s", poll_err)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in request monitor loop: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables asynchronously without blocking uvicorn startup
    asyncio.create_task(asyncio.to_thread(safe_run_migrations))
    monitor_task = asyncio.create_task(monitor_assistance_requests())
    stick_task = asyncio.create_task(monitor_esp8266_stick())
    logger.info("Volunteer Assistance API started. Escalation & ESP8266 stick bridge active.")
    yield
    monitor_task.cancel()
    stick_task.cancel()
    logger.info("Volunteer Assistance API shutdown.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="2.0.0",
    description="Nearby Volunteer Assistance, Family Live Tracking & Smart Stick API",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth_router)
app.include_router(volunteer_router)
app.include_router(assistance_router)
app.include_router(live_assist_router)
app.include_router(stick_router)
app.include_router(hardware_router)
app.include_router(family_router)
app.include_router(safety_router)
app.include_router(telegram_router)
app.include_router(bmtc_router)
app.include_router(bus_router)
app.include_router(assistant_router)
app.include_router(health_router)


# ── Real-Time WebSocket Endpoints ─────────────────────────────────────────────
@app.websocket("/ws/hardware")
async def hardware_button_websocket_endpoint(
    websocket: WebSocket,
    device_id: str = Query(default="esp32-voice-button"),
    token: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    client_id: Optional[str] = Query(default=None),
):
    expected_tok = (settings.HARDWARE_BUTTON_TOKEN or "").strip()
    if expected_tok and not hmac.compare_digest(token or "", expected_tok):
        await websocket.close(code=4401)
        return

    await notification_hub.connect_hardware(websocket, device_id, user_id=user_id)
    try:
        await websocket.send_json({
            "type": "HARDWARE_CONNECTED",
            "device_id": device_id,
            "assistant_subscribers": len(notification_hub.assistant_subscribers),
        })
        while True:
            raw = await websocket.receive_text()
            if raw == "ping":
                notification_hub.record_hardware_activity(device_id)
                await websocket.send_text("pong")
                continue
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if not isinstance(msg, dict):
                continue
            if msg.get("type") == "PING":
                notification_hub.record_hardware_activity(device_id)
                await websocket.send_json({"type": "PONG"})
                continue
            action = msg.get("action")
            if action in ("single_press", "cancel", "long_press", "press_hold_sos"):
                db: Session = SessionLocal()
                try:
                    req_obj = HardwareButtonEventRequest(
                        action=action,
                        device_id=msg.get("device_id") or device_id,
                        user_id=msg.get("user_id") or user_id,
                        client_id=msg.get("client_id") or client_id,
                        source=msg.get("source") or "esp32_ws",
                        latitude=msg.get("latitude"),
                        longitude=msg.get("longitude"),
                    )
                    ack = await process_hardware_button_event(req_obj, db)
                    await websocket.send_json({"type": "HARDWARE_ACK", **ack})
                finally:
                    db.close()
    except WebSocketDisconnect:
        notification_hub.disconnect_hardware(device_id)
    except Exception as e:
        logger.warning(f"Hardware WebSocket error for {device_id}: {e}")
        notification_hub.disconnect_hardware(device_id)


@app.websocket("/ws/assistant/{client_id}")
async def assistant_websocket_endpoint(websocket: WebSocket, client_id: str):
    await notification_hub.connect_assistant_subscriber(websocket, client_id)
    try:
        await websocket.send_json({
            "type": "ASSISTANT_WS_CONNECTED",
            "client_id": client_id,
            "hardware_connected": len(notification_hub.hardware_connections) > 0,
            "hardware_count": len(notification_hub.hardware_connections),
        })
        while True:
            raw = await websocket.receive_text()
            if raw == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        notification_hub.disconnect_assistant_subscriber(client_id)
    except Exception as e:
        logger.warning(f"Assistant WebSocket error for {client_id}: {e}")
        notification_hub.disconnect_assistant_subscriber(client_id)
@app.websocket("/ws/family/{invite_code}")
async def family_websocket_endpoint(websocket: WebSocket, invite_code: str):
    await notification_hub.connect_family_watcher(websocket, invite_code)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        notification_hub.disconnect_family_watcher(websocket, invite_code)
    except Exception as e:
        logger.warning(f"Family WebSocket error for {invite_code}: {e}")
        notification_hub.disconnect_family_watcher(websocket, invite_code)


@app.websocket("/ws/{user_id}/{role}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, role: str):
    await notification_hub.connect(websocket, user_id, role)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
                continue
            try:
                msg = json.loads(data)
            except Exception:
                continue
            if isinstance(msg, dict) and msg.get("type", "").startswith("WEBRTC_"):
                target_id = msg.get("target_user_id")
                if target_id:
                    msg["from_user_id"] = user_id
                    await notification_hub.send_to_user(target_id, msg)
    except WebSocketDisconnect:
        notification_hub.disconnect(websocket, user_id, role)
    except Exception as e:
        logger.warning(f"WebSocket error for user {user_id}: {e}")
        notification_hub.disconnect(websocket, user_id, role)


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "SightLink AI Assistance & Family Tracking Hub",
        "active_websockets": len(notification_hub.active_connections),
        "family_watchers": sum(len(s) for s in notification_hub.family_watchers.values()),
        "fcm_status": fcm_service.get_status(),
        "google_signin_configured": bool((settings.GOOGLE_CLIENT_ID or "").strip()),
        "gmail_configured": gmail_sender.is_configured,
        "telegram_configured": telegram_bot.is_configured,
    }


# ── Serve Built React Frontend (if present) ───────────────────────────────────
frontend_dist = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "frontend", "frontend", "dist")
)
fallback_dist = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
)
_dist_dir = frontend_dist if os.path.exists(frontend_dist) else fallback_dist

if os.path.exists(_dist_dir):
    assets_dir = os.path.join(_dist_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        clean_path = full_path.lstrip("/")
        if clean_path == "api" or clean_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        file_path = os.path.join(_dist_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(_dist_dir, "index.html"))
