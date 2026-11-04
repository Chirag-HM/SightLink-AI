import socketio
import json
import time
import threading
import math
import requests

SOCKET_URL = "https://crtslb.chalo.com"
ESP_IP = "10.192.24.89"
ESP_GPS_URL = f"http://{ESP_IP}/gps"

ROUTE_ID = "WflFF29b"
ROUTE_NAME = "KIA-8"

sio = socketio.Client(
    reconnection=True,
    reconnection_attempts=5
)

latest_buses = {}
lock = threading.Lock()


# --------------------------------------------------
# GET GPS FROM ESP8266
# --------------------------------------------------

def get_esp_gps():
    try:
        response = requests.get(
            ESP_GPS_URL,
            timeout=3
        )

        data = response.json()

        if not data.get("fix"):
            print("ESP GPS: NO FIX")
            return None

        latitude = data.get("latitude")
        longitude = data.get("longitude")

        if latitude is None or longitude is None:
            return None

        return {
            "latitude": float(latitude),
            "longitude": float(longitude)
        }

    except Exception as e:
        print("ESP GPS ERROR:", e)
        return None


# --------------------------------------------------
# HAVERSINE DISTANCE
# --------------------------------------------------

def calculate_distance(lat1, lon1, lat2, lon2):

    R = 6371000  # meters

    lat1 = math.radians(lat1)
    lat2 = math.radians(lat2)

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2) ** 2
        +
        math.cos(lat1)
        * math.cos(lat2)
        * math.sin(dlon / 2) ** 2
    )

    c = 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a)
    )

    return R * c


# --------------------------------------------------
# FIND NEAREST BUS
# --------------------------------------------------

previous_distances = {}


def find_nearest_bus():
    gps = get_esp_gps()

    if not gps:
        print("Cannot calculate nearest bus - ESP GPS unavailable")
        return None

    user_lat = gps["latitude"]
    user_lon = gps["longitude"]

    print()
    print("--------------------------------")
    print("ESP8266 GPS")
    print(f"Latitude : {user_lat}")
    print(f"Longitude: {user_lon}")

    with lock:
        buses = list(latest_buses.values())

    if not buses:
        print("No live buses available")
        return None

    nearest = None
    nearest_distance = float("inf")

    for bus in buses:
        bus_lat = bus.get("latitude")
        bus_lon = bus.get("longitude")

        if bus_lat is None or bus_lon is None:
            continue

        distance = calculate_distance(
            user_lat,
            user_lon,
            bus_lat,
            bus_lon
        )

        bus["distance_meters"] = distance

        bus_number = bus["bus_number"]

        # Check previous distance
        previous_distance = previous_distances.get(bus_number)

        if previous_distance is None:
            movement = "UNKNOWN"
        elif distance < previous_distance - 50:
            movement = "APPROACHING"
        elif distance > previous_distance + 50:
            movement = "MOVING AWAY"
        else:
            movement = "NEARLY STATIONARY"

        bus["movement"] = movement

        previous_distances[bus_number] = distance

        if distance < nearest_distance:
            nearest_distance = distance
            nearest = bus

    if nearest:
        print()
        print("NEAREST BUS")
        print(f"Route     : {ROUTE_NAME}")
        print(f"Bus       : {nearest['bus_number']}")
        print(f"Distance  : {nearest_distance:.0f} meters")
        print(f"ETA       : {nearest['eta']}")
        print(f"Bearing   : {nearest['bearing']}°")
        print(f"Movement  : {nearest['movement']}")
        print("--------------------------------")

    return nearest


# --------------------------------------------------
# SOCKET CONNECT
# --------------------------------------------------

@sio.event
def connect():

    print("CONNECTED TO BMTC LIVE SERVER")

    request = {
        "ref": f"routes:{ROUTE_ID}",
        "requestId": 1
    }

    print(f"Subscribing to {ROUTE_NAME}...")

    sio.emit(
        "subscribe",
        json.dumps(request)
    )


# --------------------------------------------------
# SOCKET DISCONNECT
# --------------------------------------------------

@sio.event
def disconnect():

    print("DISCONNECTED")


# --------------------------------------------------
# RECEIVE LIVE BUS DATA
# --------------------------------------------------

@sio.on("message")
def on_message(data):

    try:

        if isinstance(data, str):
            data = json.loads(data)

        if data.get("ref") != f"routes:{ROUTE_ID}":
            return

        buses = data.get("res", {})

        with lock:

            for bus_id, bus_data in buses.items():

                if isinstance(bus_data, str):
                    bus_data = json.loads(bus_data)

                bus_number = bus_data.get("vNo")

                if not bus_number:
                    continue

                latest_buses[bus_number] = {
                    "bus_number": bus_number,
                    "latitude": bus_data.get("_latitude"),
                    "longitude": bus_data.get("_longitude"),
                    "bearing": bus_data.get("bearing"),
                    "eta": bus_data.get("eta"),
                    "is_halted": bus_data.get("_isHalted"),
                    "updated": time.time()
                }

                print(
                    f"BUS: {bus_number} | "
                    f"LAT: {bus_data.get('_latitude')} | "
                    f"LON: {bus_data.get('_longitude')} | "
                    f"ETA: {bus_data.get('eta')} | "
                    f"BEARING: {bus_data.get('bearing')}"
                )

    except Exception as e:

        print("MESSAGE ERROR:", e)


# --------------------------------------------------
# MAIN
# --------------------------------------------------

def start_tracker():

    print("Connecting to BMTC live server...")

    sio.connect(
        SOCKET_URL,
        socketio_path="products/live/partitions/0/",
        transports=["websocket"],
        wait_timeout=30
    )

    # Check nearest bus every 10 seconds
    def gps_loop():

        while True:

            time.sleep(10)

            try:
                find_nearest_bus()
            except Exception as e:
                print("GPS LOOP ERROR:", e)

    threading.Thread(
        target=gps_loop,
        daemon=True
    ).start()

    sio.wait()


if __name__ == "__main__":
    start_tracker()