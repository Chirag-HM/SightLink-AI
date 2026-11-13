from typing import Optional
from fastapi import APIRouter, Query
from ..bus_service import bus_service

router = APIRouter(prefix="/api/bus", tags=["Unified Transit & Bus Arrivals"])


@router.get("/providers")
def get_bus_providers():
    return {
        "providers": bus_service.get_provider_status(),
    }


@router.get("/nearest-stop")
async def get_nearest_bus_stop(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
):
    stop = await bus_service.get_nearest_stop(latitude, longitude)
    if not stop:
        return {
            "found": False,
            "stop": None,
            "message": "No local transit stop catalog configured for these coordinates.",
        }
    return {"found": True, "stop": stop}


@router.get("/arrivals")
async def get_bus_arrivals(
    route: str = Query(..., min_length=1, max_length=32),
    latitude: Optional[float] = Query(default=None, ge=-90.0, le=90.0),
    longitude: Optional[float] = Query(default=None, ge=-180.0, le=180.0),
    city: Optional[str] = Query(default=None, max_length=64),
    provider: Optional[str] = Query(default=None, max_length=32),
):
    return await bus_service.get_bus_arrivals(
        route,
        lat=latitude,
        lng=longitude,
        city=city,
        provider_override=provider,
    )

