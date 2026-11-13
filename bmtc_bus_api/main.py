import socketio
import json
import time
import math

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
import requests
import pyttsx3
from math import radians, sin, cos, sqrt, atan2, degrees
from concurrent.futures import ThreadPoolExecutor, as_completed


app = FastAPI(title="BMTC Bus Tracking API")


# =========================================================
# BMTC URLs
# =========================================================

BMTC_VEHICLE_URL = (
    "https://bmtcmobileapi.karnataka.gov.in/"
    "WebAPI/VehicleTripDetails_v2"
)

BMTC_ROUTE_URL = (
    "https://bmtcmobileapi.karnataka.gov.in/"
    "WebAPI/SearchByRouteDetails_v4"
)

BMTC_SEARCH_ROUTE_URL = (
    "https://bmtcmobileapi.karnataka.gov.in/"
    "WebAPI/SearchRoute_v2"
)

BMTC_TRIP_URL = (
    "https://bmtcmobileapi.karnataka.gov.in/"
    "WebAPI/TripPlannerMSMD"
)
BMTC_ALL_ROUTES_URL = (
    "https://bmtcmobileapi.karnataka.gov.in/"
    "WebAPI/GetAllRouteList"
)


# =========================================================
# Vehicle Cache
# =========================================================

VEHICLE_CACHE = {}


# =========================================================
# BMTC Headers
# =========================================================

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "lan": "en",
    "deviceType": "ANDROID",
    "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 13; Build/TP1A.220624.014)",
}


# =========================================================
# HOME
# =========================================================

@app.get("/")
def home():

    return {
        "message": "BMTC Bus Tracking API is running"
    }


# =========================================================
# GET BUS BY VEHICLE ID
# =========================================================

@app.get("/bus/{vehicle_id}")
def get_bus(vehicle_id: int):

    payload = {
        "vehicleId": vehicle_id
    }

    try:

        response = requests.post(
            BMTC_VEHICLE_URL,
            json=payload,
            headers=HEADERS,
            timeout=20
        )

        print(
            "BMTC vehicle status:",
            response.status_code
        )

        response.raise_for_status()

        data = response.json()

    except requests.exceptions.RequestException as e:

        raise HTTPException(
            status_code=502,
            detail=f"BMTC API request failed: {str(e)}"
        )

    live_location = data.get(
        "LiveLocation",
        []
    )

    if not live_location:

        return {
            "success": False,
            "vehicle_id": vehicle_id,
            "message": "No live bus found"
        }

    bus = live_location[0]

    return {

        "success": True,

        "vehicle_id":
            bus.get("vehicleid"),

        "bus_number":
            bus.get("vehiclenumber"),

        "latitude":
            bus.get("latitude"),

        "longitude":
            bus.get("longitude"),

        "location":
            bus.get("location"),

        "heading":
            bus.get("heading", 0),

        "service_type":
            bus.get("servicetype"),

        "last_refresh":
            bus.get("lastrefreshon")
    }


# =========================================================
# SEARCH ROUTE
# =========================================================

def find_route_parent(route_number: str):

    try:

        response = requests.post(
            BMTC_SEARCH_ROUTE_URL,

            json={
                "routetext": route_number
            },

            headers=HEADERS,
            timeout=20
        )

        response.raise_for_status()

        data = response.json()

    except requests.exceptions.RequestException as e:

        raise HTTPException(
            status_code=502,
            detail=f"Route search failed: {str(e)}"
        )

    routes = data.get(
        "data",
        []
    )

    if not routes:
        return None

    clean_target = str(route_number).upper().replace("-", "").replace(" ", "").strip()
    # Prefer exact or normalized route match (e.g. 335E matches 335-E)
    for route in routes:
        routeno = str(route.get("routeno", "")).upper()
        if routeno == route_number.upper() or routeno.replace("-", "").replace(" ", "") == clean_target:
            return route.get("routeparentid")

    return routes[0].get(
        "routeparentid"
    )


# =========================================================
# GET BUSES BY ROUTE
# =========================================================

@app.get("/bus-route/{route_number}")
def get_bus_by_route(route_number: str):

    route_parent_id = find_route_parent(
        route_number
    )

    if route_parent_id is None:

        raise HTTPException(
            status_code=404,
            detail=f"Route {route_number} not found"
        )

    try:

        response = requests.post(

            BMTC_ROUTE_URL,

            json={
                "routeid": route_parent_id,
                "servicetypeid": 0
            },

            headers=HEADERS,
            timeout=20
        )

        response.raise_for_status()

        live_data = response.json()

    except requests.exceptions.RequestException as e:

        raise HTTPException(
            status_code=502,
            detail=f"Live bus request failed: {str(e)}"
        )

    buses = []

    # BMTC returns up and down
    for direction in [
        "up",
        "down"
    ]:

        direction_data = live_data.get(
            direction,
            {}
        )

        for station in direction_data.get(
            "data",
            []
        ):

            for bus in station.get(
                "vehicleDetails",
                []
            ):

                vehicle_id = bus.get(
                    "vehicleid"
                )

                if vehicle_id is None:
                    continue

                # Avoid duplicates
                if any(
                    b["vehicle_id"] == vehicle_id
                    for b in buses
                ):
                    continue

                buses.append({

                    "vehicle_id":
                        vehicle_id,

                    "bus_number":
                        bus.get(
                            "vehiclenumber"
                        ),

                    "latitude":
                        bus.get(
                            "centerlat"
                        ),

                    "longitude":
                        bus.get(
                            "centerlong"
                        ),

                    "heading":
                        bus.get(
                            "heading",
                            0
                        ),

                    "service_type":
                        bus.get(
                            "servicetype",
                            "Unknown"
                        ),

                    "last_refresh":
                        bus.get(
                            "lastrefreshon"
                        )
                })

    # Save discovered buses
    if buses:

        VEHICLE_CACHE[
            route_number.upper()
        ] = [

            bus["vehicle_id"]

            for bus in buses
        ]

    return {

        "success": True,

        "route_number":
            route_number,

        "route_parent_id":
            route_parent_id,

        "bus_count":
            len(buses),

        "buses":
            buses
    }


# =========================================================
# DISTANCE
# =========================================================

def calculate_distance(
    lat1,
    lon1,
    lat2,
    lon2
):

    earth_radius = 6371.0

    lat1 = radians(lat1)
    lon1 = radians(lon1)

    lat2 = radians(lat2)
    lon2 = radians(lon2)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (

        sin(dlat / 2) ** 2

        +

        cos(lat1)
        * cos(lat2)
        * sin(dlon / 2) ** 2
    )

    c = 2 * atan2(
        sqrt(a),
        sqrt(1 - a)
    )

    return earth_radius * c


# =========================================================
# BEARING
# =========================================================

def calculate_bearing(
    lat1,
    lon1,
    lat2,
    lon2
):

    lat1 = radians(lat1)
    lat2 = radians(lat2)

    dlon = radians(
        lon2 - lon1
    )

    x = (
        sin(dlon)
        * cos(lat2)
    )

    y = (

        cos(lat1)
        * sin(lat2)

        -

        sin(lat1)
        * cos(lat2)
        * cos(dlon)
    )

    bearing = degrees(
        atan2(x, y)
    )

    return (
        bearing + 360
    ) % 360


# =========================================================
# ANGLE DIFFERENCE
# =========================================================

def angle_difference(
    angle1,
    angle2
):

    difference = abs(
        angle1 - angle2
    )

    if difference > 180:

        difference = (
            360 - difference
        )

    return difference


# =========================================================
# AUTOMATIC BUS DISCOVERY
# =========================================================

# =========================================================
# AUTOMATIC BUS DISCOVERY
# =========================================================

@app.get("/discover-buses/{route_number}")
def discover_buses(route_number: str):

    route_upper = route_number.upper().strip()

    # -----------------------------------------------------
    # STEP 1: Find BMTC route parent ID
    # -----------------------------------------------------

    route_parent_id = find_route_parent(route_upper)

    if route_parent_id is None:
        return {
            "success": False,
            "route_number": route_upper,
            "message": f"Route {route_upper} not found in BMTC"
        }

    # -----------------------------------------------------
    # STEP 2: Get live buses for this exact route
    # -----------------------------------------------------

    try:

        response = requests.post(
            BMTC_ROUTE_URL,
            json={
                "routeid": route_parent_id,
                "servicetypeid": 0
            },
            headers=HEADERS,
            timeout=20
        )

        response.raise_for_status()

        live_data = response.json()

    except requests.exceptions.RequestException as e:

        return {
            "success": False,
            "route_number": route_upper,
            "route_parent_id": route_parent_id,
            "error": str(e)
        }

    # -----------------------------------------------------
    # STEP 3: Extract buses
    # -----------------------------------------------------

    buses = []

    for direction in ["up", "down"]:

        direction_data = live_data.get(
            direction,
            {}
        )

        for station in direction_data.get(
            "data",
            []
        ):

            for bus in station.get(
                "vehicleDetails",
                []
            ):

                vehicle_id = bus.get(
                    "vehicleid"
                )

                if vehicle_id is None:
                    continue

                # Avoid duplicate buses
                if any(
                    b["vehicle_id"] == vehicle_id
                    for b in buses
                ):
                    continue

                buses.append({
                    "vehicle_id": vehicle_id,
                    "bus_number": bus.get(
                        "vehiclenumber"
                    ),
                    "route": route_upper,
                    "latitude": bus.get(
                        "centerlat"
                    ),
                    "longitude": bus.get(
                        "centerlong"
                    ),
                    "heading": bus.get(
                        "heading",
                        0
                    ),
                    "service_type": bus.get(
                        "servicetype",
                        "Unknown"
                    ),
                    "last_refresh": bus.get(
                        "lastrefreshon"
                    )
                })

    # -----------------------------------------------------
    # STEP 4: Save vehicle IDs
    # -----------------------------------------------------

    if buses:

        VEHICLE_CACHE[route_upper] = [
            bus["vehicle_id"]
            for bus in buses
        ]

    # -----------------------------------------------------
    # STEP 5: Return result
    # -----------------------------------------------------

    return {
        "success": True,
        "route_number": route_upper,
        "route_parent_id": route_parent_id,
        "bus_count": len(buses),
        "buses": buses
    }
@app.get("/nearby-bus/{route_number}")
def nearby_bus(
    route_number: str,
    latitude: float,
    longitude: float
):

    route_number = route_number.strip()
    route_upper = route_number.upper()

    # -----------------------------------------------------
    # STEP 1: Try the exact route
    # -----------------------------------------------------

    try:

        result = discover_buses(route_number)

        live_buses = result.get("buses", [])

    except Exception as e:

        print("Discovery error:", e)

        live_buses = []


    # -----------------------------------------------------
    # STEP 2: If no buses, try base route
    #
    # 305-D -> 305
    # 305-M -> 305
    # 500-D -> 500
    # -----------------------------------------------------

    if not live_buses and "-" in route_number:

        base_route = route_number.split("-")[0].strip()

        print(
            f"No live buses for {route_number}. "
            f"Trying base route {base_route}"
        )

        try:

            result = discover_buses(base_route)

            live_buses = result.get("buses", [])

        except Exception as e:

            print("Base route discovery error:", e)

            live_buses = []

    else:

        base_route = route_number


    # -----------------------------------------------------
    # STEP 3: Still no buses
    # -----------------------------------------------------

    if not live_buses:

        return {
            "success": False,
            "route_number": route_number,
            "message": (
                f"No live buses found for route "
                f"{route_number}"
            )
        }


    # -----------------------------------------------------
    # STEP 4: Calculate distance for every bus
    # -----------------------------------------------------

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


        # Distance
        distance = calculate_distance(
            latitude,
            longitude,
            bus_lat,
            bus_lon
        )


        # Bearing from BUS to USER
        bearing = calculate_bearing(
            bus_lat,
            bus_lon,
            latitude,
            longitude
        )


        # Bus heading
        heading = bus.get("heading", 0)

        try:

            heading = float(heading or 0)

        except (TypeError, ValueError):

            heading = 0


        # Direction difference
        difference = angle_difference(
            heading,
            bearing
        )


        approaching = difference <= 45


        buses_with_distance.append({

            "vehicle_id":
                bus.get("vehicle_id"),

            "bus_number":
                bus.get("bus_number"),

            "latitude":
                bus_lat,

            "longitude":
                bus_lon,

            "location":
                bus.get("location"),

            "heading":
                heading,

            "distance_km":
                round(distance, 3),

            "bus_to_user_bearing":
                round(bearing, 2),

            "approaching":
                approaching,

            "service_type":
                bus.get(
                    "service_type",
                    "Unknown"
                ),

            "last_refresh":
                bus.get("last_refresh"),

            "route":
                bus.get(
                    "route",
                    route_number
                )
        })


    # -----------------------------------------------------
    # STEP 5: No GPS
    # -----------------------------------------------------

    if not buses_with_distance:

        return {
            "success": False,
            "route_number": route_number,
            "message":
                "Live buses found but GPS coordinates "
                "are unavailable"
        }


    # -----------------------------------------------------
    # STEP 6: Sort nearest bus first
    # -----------------------------------------------------

    buses_with_distance.sort(
        key=lambda x: x["distance_km"]
    )


    nearest = buses_with_distance[0]


    # -----------------------------------------------------
    # STEP 7: Voice message
    # -----------------------------------------------------

    distance = nearest["distance_km"]

    bus_number = nearest["bus_number"]

    route = nearest["route"]


    if distance < 1:

        distance_text = (
            f"{round(distance * 1000)} meters"
        )

    else:

        distance_text = (
            f"{round(distance, 1)} kilometers"
        )


    if nearest["approaching"]:

        movement = "approaching you"

    else:

        movement = "moving away from you"


    message = (
        f"Bus number {bus_number} on route {route} "
        f"is {distance_text} away and is "
        f"{movement}."
    )


    # -----------------------------------------------------
    # STEP 8: Return result
    # -----------------------------------------------------

    return {

        "success": True,

        "route_number":
            route_number,

        "total_live_buses":
            len(buses_with_distance),

        "nearest_bus":
            nearest,

        "all_buses":
            buses_with_distance,

        "message":
            message
    }
CHALO_SOCKET_URL = "https://crtslb.chalo.com"
CHALO_SOCKET_PATH = "products/live/partitions/0/"

CHALO_AUTOCOMPLETE_URL = (
    "https://production.zophop.com/"
    "scheduler_v4/v4/BENGALURU/autocomplete/route"
)


def normalize_route_code(route):
    """
    Converts route names into a standard format.

    Examples:
        401 A   -> 401A
        401-A   -> 401A
        500 C   -> 500C
        500-CA  -> 500CA
        KIA-8   -> KIA8
    """

    if not route:
        return ""

    route = str(route).upper().strip()

    route = route.replace(" ", "")
    route = route.replace("-", "")

    return route


def find_chalo_routes(route_number):

    try:
        requested = normalize_route_code(route_number)

        print("\n================================")
        print("CHALO DYNAMIC ROUTE SEARCH")
        print("User requested:", route_number)
        print("Normalized:", requested)
        print("================================")

        today = time.strftime("%A").lower()

        # Search the exact requested route first
        search_values = [requested]

        # Extract numeric/base part
        base = requested

        while base and base[-1].isalpha():
            base = base[:-1]

        # Example:
        # 401A -> 401
        # 500C -> 500
        if base and base != requested:
            search_values.append(base)

        all_routes = {}

        # -----------------------------------------
        # SEARCH CHALO
        # -----------------------------------------

        for search_value in search_values:

            print("Searching:", search_value)

            response = requests.get(
                CHALO_AUTOCOMPLETE_URL,
                params={
                    "str": search_value,
                    "day": today,
                    "station_type": "bus"
                },
                timeout=10
            )

            print(
                "Chalo status:",
                response.status_code
            )

            if response.status_code != 200:
                continue

            data = response.json()

            if not isinstance(data, list):
                continue

            for route in data:

                route_id = route.get("route_id")

                if route_id:
                    all_routes[route_id] = route

        print(
            "Total route records received:",
            len(all_routes)
        )

        # -----------------------------------------
        # MATCH ROUTES
        # -----------------------------------------

        matching_routes = []

        for route in all_routes.values():

            route_name = route.get("route_name", "")

            if not route_name:
                continue

            # Route code is normally the first part
            #
            # Example:
            # 401-K D31G-GKVK
            #       ↓
            # 401-K

            route_code = route_name.split()[0]

            normalized_code = normalize_route_code(
                route_code
            )

            # Exact match
            if normalized_code == requested:

                matching_routes.append(route)

        # -----------------------------------------
        # FAMILY MATCH
        # -----------------------------------------
        #
        # If exact route wasn't found, allow
        # family matching.
        #
        # Example:
        # 500C can find 500CA / 500CK
        #

        if not matching_routes:

            print(
                "No exact match."
                " Trying route family..."
            )

            for route in all_routes.values():

                route_name = route.get("route_name", "")

                if not route_name:
                    continue

                route_code = route_name.split()[0]

                normalized_code = normalize_route_code(
                    route_code
                )

                if normalized_code.startswith(requested):

                    matching_routes.append(route)

        # -----------------------------------------
        # CLEAN RESULT
        # -----------------------------------------

        routes = []

        for route in matching_routes:

            routes.append({
                "route_id": route.get("route_id"),
                "route_name": route.get("route_name"),
                "first_stop": route.get(
                    "first_stop_name"
                ),
                "last_stop": route.get(
                    "last_stop_name"
                ),
                "direction": route.get(
                    "direction"
                )
            })

        # -----------------------------------------
        # PRINT RESULTS
        # -----------------------------------------

        print(
            "\nMATCHING BMTC ROUTES:",
            len(routes)
        )

        for route in routes:

            print(
                f"ID: {route['route_id']} | "
                f"{route['route_name']} | "
                f"{route['first_stop']} -> "
                f"{route['last_stop']}"
            )

        print("================================\n")

        return routes

    except Exception as e:

        print(
            "CHALO ROUTE SEARCH ERROR:",
            str(e)
        )

        return []


def calculate_distance(lat1, lon1, lat2, lon2):
    R = 6371000

    lat1 = math.radians(lat1)
    lat2 = math.radians(lat2)

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(dlon / 2) ** 2
    )

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def calculate_bearing(lat1, lon1, lat2, lon2):
    lat1 = math.radians(lat1)
    lat2 = math.radians(lat2)

    dlon = math.radians(lon2 - lon1)

    y = math.sin(dlon) * math.cos(lat2)

    x = (
        math.cos(lat1) * math.sin(lat2)
        - math.sin(lat1)
        * math.cos(lat2)
        * math.cos(dlon)
    )

    bearing = math.degrees(math.atan2(y, x))

    return (bearing + 360) % 360


def angle_difference(a, b):
    return abs((a - b + 180) % 360 - 180)

def get_live_buses(route_id):
    
    live_buses = {}

    sio = socketio.Client()

    @sio.on("message")
    def on_message(data):

        try:

            if isinstance(data, str):
                data = json.loads(data)

            expected_ref = f"routes:{route_id}"

            if data.get("ref") != expected_ref:
                return

            buses = data.get("res", {})

            for bus_id, bus_data in buses.items():

                if isinstance(bus_data, str):
                    bus_data = json.loads(bus_data)

                bus_number = bus_data.get("vNo")

                latitude = bus_data.get("_latitude")
                longitude = bus_data.get("_longitude")

                if not bus_number:
                    continue

                if latitude is None or longitude is None:
                    continue

                live_buses[bus_number] = {
                    "bus_number": bus_number,
                    "latitude": float(latitude),
                    "longitude": float(longitude),
                    "bearing": bus_data.get("bearing"),
                    "eta": bus_data.get("eta"),
                    "is_halted": bus_data.get("_isHalted")
                }

        except Exception as e:

            print("CHALO MESSAGE ERROR:", e)

    try:

        print("Connecting to Chalo live server...")

        sio.connect(
            CHALO_SOCKET_URL,
            socketio_path=CHALO_SOCKET_PATH,
            transports=["websocket"],
            wait_timeout=10
        )

        print("Connected to Chalo live server")

        request = {
            "ref": f"routes:{route_id}",
            "requestId": 1
        }

        print("Subscribing to route:", route_id)

        sio.emit(
            "subscribe",
            json.dumps(request)
        )

        # Wait up to 3 seconds for live data
        end_time = time.time() + 3

        while time.time() < end_time:

            if live_buses:
                break

            time.sleep(0.1)

    except Exception as e:

        print("CHALO CONNECTION ERROR:", e)

    finally:

        try:
            sio.disconnect()
        except:
            pass

    print("Live buses received:", len(live_buses))

    return live_buses

@app.get("/voice-bus/{route_number}")
def voice_bus(
    route_number: str,
    latitude: float,
    longitude: float
):

    print()
    print("================================")
    print("CHALO LIVE BUS REQUEST")
    print("Route:", route_number)
    print("User Latitude:", latitude)
    print("User Longitude:", longitude)
    print("================================")

    # ---------------------------------
    # 1. Find route IDs from Chalo
    # ---------------------------------

    routes = find_chalo_routes(route_number)

    if not routes:

        return {
            "success": False,
            "route_number": route_number,
            "message": f"No route found for {route_number}"
        }

    # ---------------------------------
    # 2. Check matching routes IN PARALLEL
    # ---------------------------------

    all_buses = {}

    print()
    print("Checking", len(routes), "routes in parallel...")
    print("================================")

    def check_route(route):

        route_id = route["route_id"]

        print()
        print("Checking route ID:", route_id)
        print("Route name:", route["route_name"])
        print(
            "Direction:",
            route["first_stop"],
            "->",
            route["last_stop"]
        )

        buses = get_live_buses(route_id)

        return route, buses

    # Run multiple Chalo connections simultaneously
    with ThreadPoolExecutor(max_workers=8) as executor:

        futures = [
            executor.submit(check_route, route)
            for route in routes
        ]

        for future in as_completed(futures):

            try:

                route, buses = future.result()

                print(
                    "Route completed:",
                    route["route_id"],
                    "| Live buses:",
                    len(buses)
                )

                for bus_number, bus in buses.items():

                    bus["route_id"] = route["route_id"]
                    bus["route_name"] = route["route_name"]
                    bus["first_stop"] = route["first_stop"]
                    bus["last_stop"] = route["last_stop"]

                    all_buses[bus_number] = bus

            except Exception as e:

                print(
                    "Route checking error:",
                    str(e)
                )

    print()
    print("================================")
    print("TOTAL LIVE BUSES:", len(all_buses))
    print("================================")

    # ---------------------------------
    # 3. No live buses
    # ---------------------------------

    if not all_buses:

        return {
            "success": False,
            "route_number": route_number,
            "message": f"No live buses found for {route_number}"
        }

    # ---------------------------------
    # 4. Find nearest bus
    # ---------------------------------

    nearest_bus = None
    nearest_distance = float("inf")

    for bus in all_buses.values():

        distance = calculate_distance(
            latitude,
            longitude,
            bus["latitude"],
            bus["longitude"]
        )

        bus["distance_meters"] = distance

        if distance < nearest_distance:

            nearest_distance = distance
            nearest_bus = bus

    if nearest_bus is None:

        return {
            "success": False,
            "route_number": route_number,
            "message": "Unable to calculate nearest bus"
        }

    # ---------------------------------
    # 5. Determine movement
    # ---------------------------------

    approaching = False

    bus_bearing = nearest_bus.get("bearing")

    if bus_bearing is not None:

        try:

            bus_bearing = float(bus_bearing)

            direction_to_user = calculate_bearing(
                nearest_bus["latitude"],
                nearest_bus["longitude"],
                latitude,
                longitude
            )

            difference = angle_difference(
                bus_bearing,
                direction_to_user
            )

            approaching = difference <= 45

        except Exception as e:

            print(
                "Bearing calculation error:",
                e
            )

    if approaching:
        movement = "is approaching you"
    else:
        movement = "is moving away from you"

    # ---------------------------------
    # 6. Prepare response
    # ---------------------------------

    distance_m = round(nearest_distance)

    bus_number = nearest_bus["bus_number"]

    eta = nearest_bus.get("eta")

    route_name = nearest_bus.get("route_name")

    first_stop = nearest_bus.get("first_stop")

    last_stop = nearest_bus.get("last_stop")

    message = (
        f"Bus {route_number}, "
        f"number {bus_number}, "
        f"is approximately "
        f"{distance_m} meters away "
        f"and {movement}."
    )

    if eta is not None and float(eta) > 0:
        message += (
        f" Estimated arrival time is "
        f"{eta} seconds."
    )

    print()
    print("================================")
    print("NEAREST LIVE BUS")
    print("Bus:", bus_number)
    print("Route:", route_name)
    print(
        "Direction:",
        first_stop,
        "->",
        last_stop
    )
    print("Distance:", distance_m, "meters")
    print("Bearing:", nearest_bus.get("bearing"))
    print("ETA:", eta)
    print("Approaching:", approaching)
    print("================================")

    return {
        "success": True,
        "route_number": route_number,
        "message": message,
        "bus_number": bus_number,
        "distance_meters": distance_m,
        "approaching": approaching,
        "eta_seconds": eta,
        "route_name": route_name,
        "direction": f"{first_stop} -> {last_stop}",
        "latitude": nearest_bus["latitude"],
        "longitude": nearest_bus["longitude"],
        "bearing": nearest_bus.get("bearing")
    }
@app.get("/speak-bus/{route_number}")
def speak_bus(
    route_number: str,
    latitude: float,
    longitude: float
):

    result = nearby_bus(
        route_number,
        latitude,
        longitude
    )

    if not result.get(
        "success"
    ):

        return result

    nearest = result[
        "nearest_bus"
    ]

    bus_number = nearest[
        "bus_number"
    ]

    distance_m = round(
        nearest["distance_km"]
        * 1000
    )

    approaching = nearest[
        "approaching"
    ]

    if approaching:

        movement = (
            "is approaching you"
        )

    else:

        movement = (
            "is moving away from you"
        )

    message = (

        f"Bus {route_number}, "

        f"bus number {bus_number}, "

        f"is approximately "

        f"{distance_m} meters away "

        f"and {movement}."
    )

    # Text-to-speech
    engine = pyttsx3.init()

    engine.setProperty(
        "rate",
        150
    )

    engine.setProperty(
        "volume",
        1.0
    )

    engine.say(
        message
    )

    engine.runAndWait()

    return {

        "success": True,

        "message":
            message
    }


# =========================================================
# SPEAK VEHICLE
# =========================================================

@app.get("/speak-vehicle/{vehicle_id}")
def speak_vehicle(
    vehicle_id: int
):

    result = get_bus(
        vehicle_id
    )

    if not result.get(
        "success"
    ):

        return result

    bus_number = result.get(
        "bus_number"
    )

    location = result.get(
        "location"
    )

    heading = result.get(
        "heading",
        0
    )

    message = (

        f"Bus number {bus_number} "

        f"is currently at "

        f"{location}. "

        f"The bus heading is "

        f"{round(float(heading))} "

        f"degrees."
    )

    engine = pyttsx3.init()

    engine.setProperty(
        "rate",
        150
    )

    engine.setProperty(
        "volume",
        1.0
    )

    engine.say(
        message
    )

    engine.runAndWait()

    return {

        "success": True,

        "message":
            message
    }


# =========================================================
# NEARBY VEHICLE
# =========================================================

@app.get("/debug-route/{route_number}")
def debug_route(
    route_number: str
):

    parent_id = find_route_parent(
        route_number
    )

    if parent_id is None:

        return {

            "success": False,

            "message":
                "Route not found"
        }

    response = requests.post(

        BMTC_ROUTE_URL,

        json={

            "routeid":
                parent_id,

            "servicetypeid":
                0
        },

        headers=HEADERS,

        timeout=15
    )

    return {

        "route_number":
            route_number,

        "route_parent_id":
            parent_id,

        "bmtc_status_code":
            response.status_code,

        "raw_bmtc_response":
            response.json()
    }


# =========================================================
# TEST TRIP
# =========================================================

@app.post("/test-trip")
def test_trip():

    payload = {

        "filterBy":
            0,

        "fromDateTime":
            None,

        "fromStationId":
            21696,

        "lan":
            "en",

        "serviceTypeId":
            None,

        "toStationId":
            29180
    }

    response = requests.post(

        BMTC_TRIP_URL,

        json=payload,

        headers=HEADERS,

        timeout=15
    )

    return {

        "status_code":
            response.status_code,

        "response":
            response.json()
    }


# =========================================================
# DISCOVERY DEBUG
# =========================================================

@app.get("/discover-debug/{route_number}")
def discover_debug(
    route_number: str
):

    response = requests.post(

        BMTC_TRIP_URL,

        json={

            "filterBy":
                0,

            "fromDateTime":
                None,

            "fromStationId":
                21696,

            "lan":
                "en",

            "serviceTypeId":
                None,

            "toStationId":
                29180
        },

        headers=HEADERS,

        timeout=15
    )

    result = response.json()

    planner_data = result.get(
        "data",
        {}
    )

    discovered = []

    # -----------------------------------------------------
    # Direct Routes
    # -----------------------------------------------------

    for group in planner_data.get(
        "directRoutes",
        []
    ):

        for trip in group:

            discovered.append({

                "source":
                    "directRoutes",

                "vehicle_id":
                    trip.get(
                        "vehicleId"
                    ),

                "bus_number":
                    trip.get(
                        "busNo"
                    ),

                "route":
                    trip.get(
                        "routeno"
                    )
            })

    # -----------------------------------------------------
    # Transfer Routes
    # -----------------------------------------------------

    for group in planner_data.get(
        "transferRoutes",
        []
    ):

        for trip in group:

            discovered.append({

                "source":
                    "transferRoutes",

                "vehicle_id":
                    trip.get(
                        "vehicleId"
                    ),

                "bus_number":
                    trip.get(
                        "busNo"
                    ),

                "route":
                    trip.get(
                        "routeno"
                    )
            })

    return {

        "bmtc_status":
            response.status_code,

        "vehicles_found":
            len(discovered),

        "vehicles":
            discovered,

        "raw_response":
            result
    }


# =========================================================
# GET ALL BMTC ROUTES
# =========================================================

@app.get("/routes")
def get_all_routes():

    try:

        response = requests.post(
            BMTC_ALL_ROUTES_URL,
            json={},
            headers=HEADERS,
            timeout=20
        )

        response.raise_for_status()

        data = response.json()

    except requests.exceptions.RequestException as e:

        raise HTTPException(
            status_code=502,
            detail=f"BMTC route list request failed: {str(e)}"
        )

    routes = data.get("data", [])

    return {
        "success": True,
        "route_count": len(routes),
        "routes": routes
    }


# =========================================================
# TRACKER PAGE
# =========================================================

@app.get("/tracker")
def tracker():
    return FileResponse(
        "static/index.html"
    )