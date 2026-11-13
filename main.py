import os
import sys
from typing import Optional
from fastapi import FastAPI, Query, WebSocket
from fastapi.middleware.cors import CORSMiddleware

_ESP_CAM_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ESP32_CAM_Test")
if os.path.isdir(_ESP_CAM_DIR) and _ESP_CAM_DIR not in sys.path:
    sys.path.insert(0, _ESP_CAM_DIR)

from volunteer_assistance.backend.main import (
    lifespan as assistance_lifespan,
    auth_router,
    volunteer_router,
    assistance_router,
    live_assist_router,
    stick_router,
    hardware_router,
    family_router,
    safety_router,
    telegram_router,
    bmtc_router,
    bus_router,
    assistant_router,
    websocket_endpoint as assistance_websocket_endpoint,
    family_websocket_endpoint,
    hardware_button_websocket_endpoint,
    assistant_websocket_endpoint,
    health_check as assistance_health_check,
)
from volunteer_assistance.backend.routes.bmtc_routes import (  # noqa: F401
    BMTC_VEHICLE_URL,
    BMTC_ROUTE_URL,
    BMTC_SEARCH_ROUTE_URL,
    BMTC_TRIP_URL,
    BMTC_ALL_ROUTES_URL,
    VEHICLE_CACHE,
    HEADERS,
    calculate_distance,
    calculate_bearing,
    angle_difference,
    find_route_parent,
    get_bus,
    get_bus_by_route,
    discover_buses,
    nearby_bus,
    voice_bus,
    speak_bus,
    speak_vehicle,
    debug_route,
    test_trip,
    discover_debug,
    get_all_routes,
)


app = FastAPI(
    title="SightLink AI & BMTC Bus Tracking API",
    lifespan=assistance_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.websocket("/ws/hardware")
async def unified_hardware_websocket_endpoint(
    websocket: WebSocket,
    device_id: str = Query(default="esp32-voice-button"),
    token: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    client_id: Optional[str] = Query(default=None),
):
    await hardware_button_websocket_endpoint(
        websocket,
        device_id=device_id,
        token=token,
        user_id=user_id,
        client_id=client_id,
    )


@app.websocket("/ws/assistant/{client_id}")
async def unified_assistant_websocket_endpoint(websocket: WebSocket, client_id: str):
    await assistant_websocket_endpoint(websocket, client_id)


@app.websocket("/ws/family/{invite_code}")
async def unified_family_websocket_endpoint(websocket: WebSocket, invite_code: str):
    await family_websocket_endpoint(websocket, invite_code)


@app.websocket("/ws/{user_id}/{role}")
async def unified_websocket_endpoint(websocket: WebSocket, user_id: str, role: str):
    await assistance_websocket_endpoint(websocket, user_id, role)


@app.get("/api/health")
def unified_health_check():
    return assistance_health_check()


@app.get("/")
def home():
    return {"message": "BMTC Bus Tracking API is running"}
