import os
from math import radians, sin, cos, sqrt, atan2, degrees
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import requests

try:
    import pyttsx3
except ImportError:
    pyttsx3 = None

router = APIRouter(tags=["BMTC Bus Tracking"])

BMTC_VEHICLE_URL = "https://bmtcmobileapi.karnataka.gov.in/WebAPI/VehicleTripDetails_v2"
BMTC_ROUTE_URL = "https://bmtcmobileapi.karnataka.gov.in/WebAPI/SearchByRouteDetails_v4"
BMTC_SEARCH_ROUTE_URL = "https://bmtcmobileapi.karnataka.gov.in/WebAPI/SearchRoute_v2"
BMTC_TRIP_URL = "https://bmtcmobileapi.karnataka.gov.in/WebAPI/TripPlannerMSMD"
BMTC_ALL_ROUTES_URL = "https://bmtcmobileapi.karnataka.gov.in/WebAPI/GetAllRouteList"

VEHICLE_CACHE: dict[str, list] = {}

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "lan": "en",
    "deviceType": "ANDROID",
    "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 13; Build/TP1A.220624.014)",
}


def _speak_text_offline(message: str):
    if pyttsx3 is None:
        return
    try:
        engine = pyttsx3.init()
        engine.setProperty("rate", 150)
        engine.setProperty("volume", 1.0)
        engine.say(message)
        engine.runAndWait()
    except Exception:
        pass


def calculate_distance(lat1, lon1, lat2, lon2):
    earth_radius = 6371.0
    lat1 = radians(lat1)
    lon1 = radians(lon1)
    lat2 = radians(lat2)
    lon2 = radians(lon2)

    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return earth_radius * c


def calculate_bearing(lat1, lon1, lat2, lon2):
    lat1 = radians(lat1)
    lat2 = radians(lat2)
    dlon = radians(lon2 - lon1)
    x = sin(dlon) * cos(lat2)
    y = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dlon)
    bearing = degrees(atan2(x, y))
    return (bearing + 360) % 360


def angle_difference(angle1, angle2):
    difference = abs(angle1 - angle2)
    if difference > 180:
        difference = 360 - difference
    return difference


@router.get("/bus/{vehicle_id}")
def get_bus(vehicle_id: int):
    payload = {"vehicleId": vehicle_id}
    try:
        response = requests.post(
            BMTC_VEHICLE_URL,
            json=payload,
            headers=HEADERS,
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=502,
            detail=f"BMTC API request failed: {str(e)}",
        )

    live_location = data.get("LiveLocation", [])
    if not live_location:
        return {
            "success": False,
            "vehicle_id": vehicle_id,
            "message": "No live bus found",
        }

    bus = live_location[0]
    return {
        "success": True,
        "vehicle_id": bus.get("vehicleid"),
        "bus_number": bus.get("vehiclenumber"),
        "latitude": bus.get("latitude"),
        "longitude": bus.get("longitude"),
        "location": bus.get("location"),
        "heading": bus.get("heading", 0),
        "service_type": bus.get("servicetype"),
        "last_refresh": bus.get("lastrefreshon"),
    }


def find_route_parent(route_number: str):
    clean_target = str(route_number).upper().replace("-", "").replace(" ", "").strip()
    try:
        response = requests.post(
            BMTC_SEARCH_ROUTE_URL,
            json={"routetext": route_number},
            headers=HEADERS,
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=502,
            detail=f"Route search failed: {str(e)}",
        )

    routes = data.get("data", [])
    if not routes:
        return None

    for route in routes:
        routeno = str(route.get("routeno", "")).upper()
        if routeno == route_number.upper() or routeno.replace("-", "").replace(" ", "") == clean_target:
            return route.get("routeparentid")

    return routes[0].get("routeparentid")


@router.get("/bus-route/{route_number}")
def get_bus_by_route(route_number: str):
    route_parent_id = find_route_parent(route_number)
    if route_parent_id is None:
        raise HTTPException(
            status_code=404,
            detail=f"Route {route_number} not found",
        )

    try:
        response = requests.post(
            BMTC_ROUTE_URL,
            json={"routeid": route_parent_id, "servicetypeid": 0},
            headers=HEADERS,
            timeout=20,
        )
        response.raise_for_status()
        live_data = response.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=502,
            detail=f"Live bus request failed: {str(e)}",
        )

    buses = []
    for direction in ["up", "down"]:
        direction_data = live_data.get(direction, {})
        for station in direction_data.get("data", []):
            for bus in station.get("vehicleDetails", []):
                vehicle_id = bus.get("vehicleid")
                if vehicle_id is None:
                    continue
                if any(b["vehicle_id"] == vehicle_id for b in buses):
                    continue
                buses.append({
                    "vehicle_id": vehicle_id,
                    "bus_number": bus.get("vehiclenumber"),
                    "latitude": bus.get("centerlat"),
                    "longitude": bus.get("centerlong"),
                    "heading": bus.get("heading", 0),
                    "service_type": bus.get("servicetype", "Unknown"),
                    "last_refresh": bus.get("lastrefreshon"),
                })

    if buses:
        VEHICLE_CACHE[route_number.upper()] = [bus["vehicle_id"] for bus in buses]

    return {
        "success": True,
        "route_number": route_number,
        "route_parent_id": route_parent_id,
        "bus_count": len(buses),
        "buses": buses,
    }


@router.get("/discover-buses/{route_number}")
def discover_buses(route_number: str):
    route_upper = route_number.upper().strip()
    route_parent_id = find_route_parent(route_upper)
    if route_parent_id is None:
        return {
            "success": False,
            "route_number": route_upper,
            "message": f"Route {route_upper} not found in BMTC",
        }

    try:
        response = requests.post(
            BMTC_ROUTE_URL,
            json={"routeid": route_parent_id, "servicetypeid": 0},
            headers=HEADERS,
            timeout=20,
        )
        response.raise_for_status()
        live_data = response.json()
    except requests.exceptions.RequestException as e:
        return {
            "success": False,
            "route_number": route_upper,
            "route_parent_id": route_parent_id,
            "error": str(e),
        }

    buses = []
    for direction in ["up", "down"]:
        direction_data = live_data.get(direction, {})
        for station in direction_data.get("data", []):
            for bus in station.get("vehicleDetails", []):
                vehicle_id = bus.get("vehicleid")
                if vehicle_id is None:
                    continue
                if any(b["vehicle_id"] == vehicle_id for b in buses):
                    continue
                buses.append({
                    "vehicle_id": vehicle_id,
                    "bus_number": bus.get("vehiclenumber"),
                    "route": route_upper,
                    "latitude": bus.get("centerlat"),
                    "longitude": bus.get("centerlong"),
                    "heading": bus.get("heading", 0),
                    "service_type": bus.get("servicetype", "Unknown"),
                    "last_refresh": bus.get("lastrefreshon"),
                })

    if buses:
        VEHICLE_CACHE[route_upper] = [bus["vehicle_id"] for bus in buses]

    return {
        "success": True,
        "route_number": route_upper,
        "route_parent_id": route_parent_id,
        "bus_count": len(buses),
        "buses": buses,
    }


@router.get("/nearby-bus/{route_number}")
def nearby_bus(route_number: str, latitude: float, longitude: float):
    route_number = route_number.strip()
    try:
        result = discover_buses(route_number)
        live_buses = result.get("buses", [])
    except HTTPException:
        raise
    except Exception:
        live_buses = []

    if not live_buses and "-" in route_number:
        base_route = route_number.split("-")[0].strip()
        try:
            result = discover_buses(base_route)
            live_buses = result.get("buses", [])
        except HTTPException:
            raise
        except Exception:
            live_buses = []

    if not live_buses:
        return {
            "success": False,
            "route_number": route_number,
            "message": f"No live buses found for route {route_number}",
        }

    buses_with_distance = []
    for bus in live_buses:
        bus_lat = bus.get("latitude")
        bus_lon = bus.get("longitude")
        if bus_lat is None or bus_lon is None:
            continue
        try:
            bus_lat = float(bus_lat)
            bus_lon = float(bus_lon)
        except (TypeError, ValueError):
            continue

        distance = calculate_distance(latitude, longitude, bus_lat, bus_lon)
        bearing = calculate_bearing(bus_lat, bus_lon, latitude, longitude)
        try:
            heading = float(bus.get("heading", 0) or 0)
        except (TypeError, ValueError):
            heading = 0

        difference = angle_difference(heading, bearing)
        approaching = difference <= 45

        buses_with_distance.append({
            "vehicle_id": bus.get("vehicle_id"),
            "bus_number": bus.get("bus_number"),
            "latitude": bus_lat,
            "longitude": bus_lon,
            "location": bus.get("location"),
            "heading": heading,
            "distance_km": round(distance, 3),
            "bus_to_user_bearing": round(bearing, 2),
            "approaching": approaching,
            "service_type": bus.get("service_type", "Unknown"),
            "last_refresh": bus.get("last_refresh"),
            "route": bus.get("route", route_number),
        })

    if not buses_with_distance:
        return {
            "success": False,
            "route_number": route_number,
            "message": "Live buses found but GPS coordinates are unavailable",
        }

    buses_with_distance.sort(key=lambda x: x["distance_km"])
    nearest = buses_with_distance[0]
    distance = nearest["distance_km"]
    bus_number = nearest["bus_number"]
    route = nearest["route"]

    if distance < 1:
        distance_text = f"{round(distance * 1000)} meters"
    else:
        distance_text = f"{round(distance, 1)} kilometers"

    movement = "approaching you" if nearest["approaching"] else "moving away from you"
    message = (
        f"Bus number {bus_number} on route {route} "
        f"is {distance_text} away and is {movement}."
    )

    return {
        "success": True,
        "route_number": route_number,
        "total_live_buses": len(buses_with_distance),
        "nearest_bus": nearest,
        "all_buses": buses_with_distance,
        "message": message,
    }


@router.get("/voice-bus/{route_number}")
def voice_bus(route_number: str, latitude: float, longitude: float):
    result = nearby_bus(route_number, latitude, longitude)
    if not result.get("success"):
        return result

    nearest = result["nearest_bus"]
    bus_number = nearest["bus_number"]
    distance_m = round(nearest["distance_km"] * 1000)
    approaching = nearest["approaching"]
    movement = "is approaching you" if approaching else "is moving away from you"
    message = (
        f"Bus {route_number}, number {bus_number}, "
        f"is approximately {distance_m} meters away and {movement}."
    )
    return {
        "success": True,
        "message": message,
        "bus_number": bus_number,
        "distance_meters": distance_m,
        "approaching": approaching,
        "nearest_bus": nearest,
        "total_live_buses": result.get("total_live_buses", 1),
    }


@router.get("/speak-bus/{route_number}")
def speak_bus(route_number: str, latitude: float, longitude: float):
    result = nearby_bus(route_number, latitude, longitude)
    if not result.get("success"):
        return result

    nearest = result["nearest_bus"]
    bus_number = nearest["bus_number"]
    distance_m = round(nearest["distance_km"] * 1000)
    approaching = nearest["approaching"]
    movement = "is approaching you" if approaching else "is moving away from you"
    message = (
        f"Bus {route_number}, bus number {bus_number}, "
        f"is approximately {distance_m} meters away and {movement}."
    )
    _speak_text_offline(message)
    return {"success": True, "message": message}


@router.get("/speak-vehicle/{vehicle_id}")
def speak_vehicle(vehicle_id: int):
    result = get_bus(vehicle_id)
    if not result.get("success"):
        return result

    bus_number = result.get("bus_number")
    location = result.get("location")
    heading = result.get("heading", 0)
    message = (
        f"Bus number {bus_number} is currently at {location}. "
        f"The bus heading is {round(float(heading))} degrees."
    )
    _speak_text_offline(message)
    return {"success": True, "message": message}


@router.get("/debug-route/{route_number}")
def debug_route(route_number: str):
    parent_id = find_route_parent(route_number)
    if parent_id is None:
        return {"success": False, "message": "Route not found"}

    try:
        response = requests.post(
            BMTC_ROUTE_URL,
            json={"routeid": parent_id, "servicetypeid": 0},
            headers=HEADERS,
            timeout=15,
        )
        response.raise_for_status()
        raw = response.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"BMTC debug request failed: {str(e)}")

    return {
        "route_number": route_number,
        "route_parent_id": parent_id,
        "bmtc_status_code": response.status_code,
        "raw_bmtc_response": raw,
    }


@router.post("/test-trip")
def test_trip():
    payload = {
        "filterBy": 0,
        "fromDateTime": None,
        "fromStationId": 21696,
        "lan": "en",
        "serviceTypeId": None,
        "toStationId": 29180,
    }
    try:
        response = requests.post(BMTC_TRIP_URL, json=payload, headers=HEADERS, timeout=15)
        response.raise_for_status()
        raw = response.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"BMTC test-trip request failed: {str(e)}")

    return {"status_code": response.status_code, "response": raw}


@router.get("/discover-debug/{route_number}")
def discover_debug(route_number: str):
    try:
        response = requests.post(
            BMTC_TRIP_URL,
            json={
                "filterBy": 0,
                "fromDateTime": None,
                "fromStationId": 21696,
                "lan": "en",
                "serviceTypeId": None,
                "toStationId": 29180,
            },
            headers=HEADERS,
            timeout=15,
        )
        response.raise_for_status()
        result = response.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"BMTC discovery debug failed: {str(e)}")

    planner_data = result.get("data", {})
    discovered = []
    for source_key in ("directRoutes", "transferRoutes"):
        for group in planner_data.get(source_key, []):
            for trip in group:
                discovered.append({
                    "source": source_key,
                    "vehicle_id": trip.get("vehicleId"),
                    "bus_number": trip.get("busNo"),
                    "route": trip.get("routeno"),
                })

    return {
        "bmtc_status": response.status_code,
        "vehicles_found": len(discovered),
        "vehicles": discovered,
        "raw_response": result,
    }


@router.get("/routes")
def get_all_routes():
    try:
        response = requests.post(
            BMTC_ALL_ROUTES_URL,
            json={},
            headers=HEADERS,
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=502,
            detail=f"BMTC route list request failed: {str(e)}",
        )

    routes = data.get("data", [])
    return {
        "success": True,
        "route_count": len(routes),
        "routes": routes,
    }


@router.get("/tracker")
def tracker():
    static_path = os.path.join(os.getcwd(), "static", "index.html")
    if os.path.isfile(static_path):
        return FileResponse(static_path)
    raise HTTPException(status_code=404, detail="Legacy tracker HTML not present; use the React dashboard /bmtc.")

