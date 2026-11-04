import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .config import settings
from .database import engine, Base, SessionLocal
from .models import AssistanceRequest, RequestStatus
from .websockets import notification_hub
from .fcm import fcm_service

from .routes.auth_routes import router as auth_router
from .routes.volunteer_routes import router as volunteer_router
from .routes.assistance_routes import router as assistance_router
from .routes.stick_routes import router as stick_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("volunteer_assistance_app")

# Ensure database tables exist
Base.metadata.create_all(bind=engine)

# ── Background Task: Expire Unanswered Requests ───────────────────────────────
async def check_and_expire_requests():
    """Periodically check for pending requests that exceeded the timeout."""
    while True:
        try:
            await asyncio.sleep(15)  # Run check every 15 seconds
            db: Session = SessionLocal()
            try:
                cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.REQUEST_TIMEOUT_SECONDS)
                expired_requests = db.query(AssistanceRequest).filter(
                    AssistanceRequest.status == RequestStatus.PENDING,
                    AssistanceRequest.created_at < cutoff
                ).all()

                for req in expired_requests:
                    req.status = RequestStatus.EXPIRED
                    db.commit()
                    logger.info(f"Assistance request {req.id} expired due to timeout.")

                    # Notify blind user over WebSocket
                    await notification_hub.send_to_user(req.blind_user_id, {
                        "type": "REQUEST_EXPIRED",
                        "request_id": req.id,
                        "status": RequestStatus.EXPIRED.value,
                        "message": "Your request timed out without an available volunteer. Would you like to expand your search radius?"
                    })
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in request expiration loop: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: launch expiration task
    expiration_task = asyncio.create_task(check_and_expire_requests())
    logger.info("Volunteer Assistance API started. Expiration monitor active.")
    yield
    # Shutdown
    expiration_task.cancel()
    logger.info("Volunteer Assistance API shutdown.")

# ── FastAPI Application ───────────────────────────────────────────────────────
app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Nearby Volunteer Assistance API with Haversine distance, Atomic Claiming, and WebSockets",
    lifespan=lifespan
)

# CORS: Allow React/Vite development server
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
app.include_router(stick_router)

# ── Real-Time WebSocket Endpoint ──────────────────────────────────────────────
@app.websocket("/ws/{user_id}/{role}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, role: str):
    await notification_hub.connect(websocket, user_id, role)
    try:
        while True:
            # Keep socket alive and receive client pings/messages
            data = await websocket.receive_text()
            # Echo heartbeat ping/pong
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        notification_hub.disconnect(websocket, user_id, role)
    except Exception as e:
        logger.warning(f"WebSocket error for user {user_id}: {e}")
        notification_hub.disconnect(websocket, user_id, role)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Nearby Volunteer Assistance Hub",
        "active_websockets": len(notification_hub.active_connections),
        "fcm_status": fcm_service.get_status()
    }

# ── Serve Built React Frontend ────────────────────────────────────────────────
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

frontend_dist = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
)

if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))

