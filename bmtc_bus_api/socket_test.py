import json
import socketio
import time

sio = socketio.Client(logger=True, engineio_logger=True)

@sio.event
def connect():
    print("CONNECTED")

    # ChaloSocketRequest:
    # String = service name
    # int    = requestId
    # List   = parameters
     
    request = {
    "ref": "routes:WflFF29b",
    "requestId": 1
}

    print("SUBSCRIBING:")
    print(request)

    sio.emit("subscribe", json.dumps(request))


@sio.event
def disconnect():
    print("DISCONNECTED")


@sio.event
def connect_error(data):
    print("CONNECT ERROR:", data)


@sio.on("*")
def catch_all(event, data):
    print("EVENT:", event)
    print("DATA:", data)


print("Connecting...")

try:
    sio.connect(
        "https://crtslb.chalo.com",
        socketio_path="/products/live/partitions/0",
        transports=["websocket"],
        wait_timeout=20
    )

    while sio.connected:
        time.sleep(1)

except Exception as e:
    print("ERROR:", e)

finally:
    if sio.connected:
        sio.disconnect()