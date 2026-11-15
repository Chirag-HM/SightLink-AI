import os
import re
from typing import Optional, List, Dict, Any
from math import radians, sin, cos, sqrt, atan2, degrees
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import requests
from ..data.bmtc_transit_graph import (
    BMTC_ROUTES_MASTER,
    BMTC_STOPS_CATALOG,
    match_stop_by_query,
    find_routes_between_stops,
    estimate_bmtc_fare,
    calculate_haversine_distance,
)

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


# ── Route Stops from Source to Destination ────────────────────────────────────
@router.get("/route-stops/{route_number}")
@router.get("/api/route-stops/{route_number}")
@router.get("/api/bmtc/route-stops/{route_number}")
def get_route_stops(
    route_number: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
):
    """
    Returns the complete sequence of bus stops from origin (source) to terminus (destination)
    for a given BMTC route, with distance, fare, user's nearest stop, and live bus positions.
    """
    clean_route = route_number.strip().upper().replace(" ", "")
    route_info = BMTC_ROUTES_MASTER.get(clean_route)

    # Fallback 1: match without hyphens (e.g. 500-D -> 500D)
    if not route_info:
        for k, v in BMTC_ROUTES_MASTER.items():
            if k.replace("-", "") == clean_route.replace("-", ""):
                route_info = v
                clean_route = k
                break

    # Fallback 2: base number match (e.g. 401A or 401-B -> 401)
    if not route_info:
        digits_match = re.search(r'\d+', clean_route)
        if digits_match:
            base_num = digits_match.group(0)
            if base_num in BMTC_ROUTES_MASTER:
                base_info = BMTC_ROUTES_MASTER[base_num]
                route_info = {
                    **base_info,
                    "route_number": clean_route,
                    "name": f"Route {clean_route} ({base_info['name']})",
                }

    # Fallback 3: dynamic route from upstream BMTC API
    if not route_info:
        parent_id = find_route_parent(clean_route)
        if parent_id is not None:
            try:
                response = requests.post(
                    BMTC_ROUTE_URL,
                    json={"routeid": parent_id, "servicetypeid": 0},
                    headers=HEADERS,
                    timeout=10,
                )
                if response.ok:
                    data = response.json()
                    up_data = data.get("up", {}).get("data", [])
                    if up_data:
                        dynamic_stops = []
                        for s_idx, st in enumerate(up_data):
                            s_lat = float(st.get("centerlat") or 0)
                            s_lng = float(st.get("centerlong") or 0)
                            dynamic_stops.append({
                                "seq": s_idx + 1,
                                "name": st.get("stationname") or f"Stop {s_idx + 1}",
                                "lat": s_lat,
                                "lng": s_lng,
                                "dist_km": round(s_idx * 1.1, 1),
                            })
                        if dynamic_stops:
                            route_info = {
                                "route_number": clean_route,
                                "name": f"Route {clean_route}",
                                "description": f"BMTC Route {clean_route}",
                                "source": dynamic_stops[0]["name"],
                                "destination": dynamic_stops[-1]["name"],
                                "service_type": "Ordinary",
                                "frequency": "Every 15 mins",
                                "total_distance_km": round(len(dynamic_stops) * 1.1, 1),
                                "estimated_duration_min": max(15, len(dynamic_stops) * 3),
                                "stops": dynamic_stops,
                            }
            except Exception:
                pass

    if not route_info:
        # Default fallback route representation
        raise HTTPException(
            status_code=404,
            detail=f"Route stop sequence for '{route_number}' not found. Try 500D, 335E, 400, 401, 401A, 365, or V-500C.",
        )

    stops_list = []
    nearest_stop = None
    min_dist_to_user = 1e9

    # Check for live buses currently on this route
    live_buses = []
    try:
        disc = discover_buses(clean_route)
        if disc.get("success"):
            live_buses = disc.get("buses", [])
    except Exception:
        live_buses = []

    for s in route_info["stops"]:
        stop_lat = s["lat"]
        stop_lng = s["lng"]
        stop_seq = s.get("seq", len(stops_list) + 1)
        stop_id = f"stop_{stop_seq}_{clean_route}"

        # Calculate distance to user if coordinates available
        user_dist_m = None
        if latitude is not None and longitude is not None:
            dist_km = calculate_haversine_distance(latitude, longitude, stop_lat, stop_lng)
            user_dist_m = round(dist_km * 1000)
            if dist_km < min_dist_to_user:
                min_dist_to_user = dist_km
                nearest_stop = {
                    **s,
                    "seq": stop_seq,
                    "sequence_number": stop_seq,
                    "stop_id": stop_id,
                    "distance_m": user_dist_m,
                }

        # Check if any live bus is approaching this stop (within 1.2 km)
        approaching_buses = []
        for b in live_buses:
            b_lat = b.get("latitude")
            b_lng = b.get("longitude")
            if b_lat and b_lng:
                d_bus_stop = calculate_haversine_distance(float(b_lat), float(b_lng), stop_lat, stop_lng)
                if d_bus_stop <= 1.2:
                    approaching_buses.append({
                        "vehicle_id": b.get("vehicle_id"),
                        "bus_number": b.get("bus_number"),
                        "distance_to_stop_m": round(d_bus_stop * 1000),
                    })

        stops_list.append({
            "seq": stop_seq,
            "sequence_number": stop_seq,
            "stop_id": stop_id,
            "name": s["name"],
            "kannada_name": s.get("kannada_name"),
            "lat": stop_lat,
            "lng": stop_lng,
            "dist_km": s.get("dist_km", 0.0),
            "dist_from_origin_km": s.get("dist_km", 0.0),
            "distance_from_start_km": s.get("dist_km", 0.0),
            "distance_to_user_m": user_dist_m,
            "live_buses_at_stop": approaching_buses,
        })

    # Mark user's nearest stop in list
    if nearest_stop:
        for st in stops_list:
            if st["seq"] == nearest_stop["seq"]:
                st["is_nearest_to_user"] = True
            else:
                st["is_nearest_to_user"] = False

    fare_info = estimate_bmtc_fare(route_info.get("total_distance_km", 20.0))

    spoken = (
        f"Route {clean_route} operates from {route_info['source']} to {route_info['destination']} "
        f"across {len(stops_list)} stops. "
    )
    if nearest_stop:
        spoken += f"Your nearest stop is {nearest_stop['name']}, approximately {nearest_stop['distance_m']} meters away."

    return {
        "success": True,
        "route_number": clean_route,
        "name": route_info["name"],
        "description": route_info["description"],
        "source": route_info["source"],
        "destination": route_info["destination"],
        "total_stops": len(stops_list),
        "total_distance_km": route_info.get("total_distance_km"),
        "estimated_duration_min": route_info.get("estimated_duration_min"),
        "service_type": route_info.get("service_type"),
        "frequency": route_info.get("frequency"),
        "fare_ordinary_inr": fare_info["ordinary_fare_inr"],
        "fare_vajra_ac_inr": fare_info["vajra_ac_fare_inr"],
        "nearest_user_stop": nearest_stop,
        "live_buses_count": len(live_buses),
        "stops": stops_list,
        "spoken_summary": spoken,
    }


# ── Trip Planner: Find Routes Between Source and Destination ──────────────────
@router.get("/trip-planner")
@router.get("/api/trip-planner")
@router.get("/api/bmtc/trip-planner")
@router.get("/source-destination")
@router.get("/api/source-destination")
@router.get("/api/bmtc/source-destination")
def plan_bmtc_trip(
    source: str,
    destination: str,
    user_lat: Optional[float] = None,
    user_lng: Optional[float] = None,
):
    """
    Searches BMTC routes connecting a Source bus stop to a Destination bus stop,
    returning direct routes, stop sequence, fare, travel duration, and live buses.
    """
    clean_src = source.strip()
    clean_dst = destination.strip()

    if not clean_src or not clean_dst:
        raise HTTPException(
            status_code=400,
            detail="Both 'source' and 'destination' stops are required.",
        )

    matching_routes = find_routes_between_stops(clean_src, clean_dst, user_lat, user_lng)

    # If no direct route found in master catalog, check if source or dest is airport / majestic
    if not matching_routes:
        src_stop = match_stop_by_query(clean_src, user_lat, user_lng)
        dst_stop = match_stop_by_query(clean_dst)
        src_name = src_stop["name"] if src_stop else clean_src
        dst_name = dst_stop["name"] if dst_stop else clean_dst

        return {
            "success": True,
            "source": src_name,
            "destination": dst_name,
            "routes_count": 0,
            "routes": [],
            "message": f"No direct BMTC route found between '{clean_src}' and '{clean_dst}'. Consider connecting via Majestic (KBS) or Central Silk Board.",
            "spoken_summary": f"I could not find a direct bus from {clean_src} to {clean_dst}. You can take a bus to Majestic or Silk Board to transfer.",
        }

    # Enrich each route with live bus tracking if available
    for r in matching_routes:
        try:
            r_num = r["route_number"]
            # Handle transfer route notation e.g. "401A → 500D"
            primary_r_num = r_num.split("→")[0].strip() if "→" in r_num else r_num
            disc = discover_buses(primary_r_num)
            buses = disc.get("buses", []) if disc.get("success") else []
            r["live_buses_count"] = len(buses)
            if buses and r.get("stops_sequence"):
                # Find nearest approaching bus to source stop
                first_stop = r["stops_sequence"][0]
                buses.sort(
                    key=lambda b: calculate_haversine_distance(
                        float(b.get("latitude") or 0),
                        float(b.get("longitude") or 0),
                        first_stop["lat"],
                        first_stop["lng"],
                    )
                )
                r["next_bus"] = buses[0]
                nearest_km = calculate_haversine_distance(
                    float(buses[0].get("latitude") or 0),
                    float(buses[0].get("longitude") or 0),
                    first_stop["lat"],
                    first_stop["lng"],
                )
                r["next_bus_eta_mins"] = max(2, int(round((nearest_km / 20.0) * 60)))
            else:
                r["next_bus"] = None
                r["next_bus_eta_mins"] = None
        except Exception:
            r["live_buses_count"] = 0
            r["next_bus"] = None
            r["next_bus_eta_mins"] = None

    primary = matching_routes[0]
    is_direct = primary.get("is_direct", True)
    if is_direct:
        spoken = (
            f"Found {len(matching_routes)} direct route{'s' if len(matching_routes) != 1 else ''} "
            f"from {primary['from_stop']} to {primary['to_stop']}. "
            f"Take route {primary['route_number']} ({primary['stops_count']} stops, {primary['estimated_time_mins']} minutes, fare ₹{primary['fare_ordinary_inr']})."
        )
    else:
        spoken = (
            f"Found connecting route from {primary['from_stop']} to {primary['to_stop']}: "
            f"take {primary['route_number']} with {primary['stops_count']} stops, approximately {primary['estimated_time_mins']} minutes, fare ₹{primary['fare_ordinary_inr']}."
        )

    if primary.get("next_bus_eta_mins"):
        spoken += f" The next live bus arrives in {primary['next_bus_eta_mins']} minutes."

    return {
        "success": True,
        "source": primary["from_stop"],
        "destination": primary["to_stop"],
        "routes_count": len(matching_routes),
        "routes": matching_routes,
        "spoken_summary": spoken,
    }


# ── Popular Bengaluru Bus Stops (For Autocomplete & Voice Prompt) ─────────────
@router.get("/popular-stops")
@router.get("/api/popular-stops")
@router.get("/api/bmtc/popular-stops")
def get_popular_stops():
    """
    Returns list of popular Bengaluru bus stops for typeahead search and voice suggestions.
    """
    stops_list = [
        {
            "id": k,
            "name": v["name"],
            "kannada_name": v.get("kannada_name"),
            "latitude": v["latitude"],
            "longitude": v["longitude"],
            "aliases": v.get("aliases", []),
        }
        for k, v in BMTC_STOPS_CATALOG.items()
    ]
    stops_list.sort(key=lambda s: s["name"])
    return {
        "success": True,
        "count": len(stops_list),
        "stops": stops_list,
    }


# ── Fare Estimation ───────────────────────────────────────────────────────────
@router.get("/fare-estimate")
@router.get("/api/fare-estimate")
@router.get("/api/bmtc/fare-estimate")
def get_fare_estimate(distance_km: float):
    """
    Calculates BMTC Ordinary vs Vajra AC fare stages for a given travel distance.
    """
    fare_info = estimate_bmtc_fare(distance_km)
    return {
        "success": True,
        **fare_info,
        "fare_description": f"Ordinary: ₹{fare_info['ordinary_fare_inr']} | Vajra AC: ₹{fare_info['vajra_ac_fare_inr']}",
    }

