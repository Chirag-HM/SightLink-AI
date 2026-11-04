import cv2
import requests
import numpy as np
import pyttsx3
import time
import threading
import queue
import argparse
from ultralytics import YOLO


# ============================================================
# ESP32-CAM CONFIGURATION
# ============================================================

DEFAULT_IP = "10.235.17.135"

CAMERA_URL = ""


# ============================================================
# YOLO CONFIGURATION
# ============================================================

MODEL_PATH = "yolov8n.pt"
CONFIDENCE_THRESHOLD = 0.50

print("[YOLO] Loading yolov8n.pt...")

model = YOLO(MODEL_PATH)

print("[YOLO] Ready — 80 classes supported")


# ============================================================
# VOICE SYSTEM
# ============================================================

speech_queue = queue.Queue()

voice_enabled = True


def speech_worker():

    while True:

        text = speech_queue.get()

        if text is None:
            speech_queue.task_done()
            break

        if not voice_enabled:
            speech_queue.task_done()
            continue

        try:

            speaker = pyttsx3.init("sapi5")

            speaker.setProperty("rate", 150)
            speaker.setProperty("volume", 1.0)

            speaker.say(text)
            speaker.runAndWait()

            speaker.stop()

            del speaker

        except Exception as e:

            print("[Voice] TTS ERROR:", repr(e))

        speech_queue.task_done()


voice_thread = threading.Thread(
    target=speech_worker,
    daemon=True
)

voice_thread.start()


def speak(text):

    if not voice_enabled:
        return

    print("🔊 SPEAKER:", text)

    speech_queue.put(text)


# ============================================================
# OBJECT ANNOUNCEMENT
# ============================================================

last_announced = {}

ANNOUNCE_INTERVAL = 5


# ============================================================
# COMMAND LINE ARGUMENTS
# ============================================================

parser = argparse.ArgumentParser(
    description="ESP32-CAM YOLOv8 Object Detection"
)

parser.add_argument(
    "--ip",
    default=DEFAULT_IP,
    help=f"ESP32-CAM IP address (default: {DEFAULT_IP})"
)

parser.add_argument(
    "--no-voice",
    action="store_true",
    help="Disable voice announcements"
)

args = parser.parse_args()


# ============================================================
# CAMERA URL
# ============================================================

CAMERA_IP = args.ip

CAMERA_URL = f"http://{CAMERA_IP}/capture"

BROWSER_URL = f"http://{CAMERA_IP}/"


if args.no_voice:
    voice_enabled = False


# ============================================================
# START MESSAGE
# ============================================================

print()
print("======================================")
print("   ESP32-CAM AI OBJECT DETECTION")
print("======================================")

print()
print("[App] Camera URL:", CAMERA_URL)
print("[App] Browser View:", BROWSER_URL)

print(
    "[App] Controls: "
    "[Q] Quit  "
    "[V] Voice  "
    "[S] Help  "
    "[R] Reconnect"
)

print()

if voice_enabled:
    print("[Voice] Voice announcements enabled")
else:
    print("[Voice] Voice announcements disabled")


# ============================================================
# CAMERA CONNECTION
# ============================================================

session = requests.Session()


def get_camera_frame():

    try:

        response = session.get(
            CAMERA_URL,
            timeout=5
        )

        if response.status_code != 200:

            print(
                "[Camera] HTTP error:",
                response.status_code
            )

            return None

        image_array = np.frombuffer(
            response.content,
            np.uint8
        )

        frame = cv2.imdecode(
            image_array,
            cv2.IMREAD_COLOR
        )

        if frame is None:

            print(
                "[Camera] Could not decode JPEG"
            )

            return None

        return frame

    except requests.exceptions.RequestException as e:

        print(
            "[Camera] Not reachable:",
            e
        )

        return None

    except Exception as e:

        print(
            "[Camera] Error:",
            repr(e)
        )

        return None


# ============================================================
# HELP OVERLAY
# ============================================================

show_help = False


def draw_help(frame):

    if not show_help:
        return frame

    overlay = frame.copy()

    cv2.rectangle(
        overlay,
        (10, 10),
        (420, 150),
        (0, 0, 0),
        -1
    )

    alpha = 0.7

    frame = cv2.addWeighted(
        overlay,
        alpha,
        frame,
        1 - alpha,
        0
    )

    cv2.putText(
        frame,
        "ESP32-CAM AI Vision",
        (25, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255, 255, 255),
        2
    )

    cv2.putText(
        frame,
        "Q - Quit",
        (25, 70),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 255, 255),
        1
    )

    cv2.putText(
        frame,
        "V - Voice ON/OFF",
        (25, 95),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 255, 255),
        1
    )

    cv2.putText(
        frame,
        "S - Show/Hide Help",
        (25, 120),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 255, 255),
        1
    )

    cv2.putText(
        frame,
        "R - Reconnect Camera",
        (25, 145),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 255, 255),
        1
    )

    return frame


# ============================================================
# MAIN LOOP
# ============================================================

while True:

    frame = get_camera_frame()

    # --------------------------------------------------------
    # Camera unavailable
    # --------------------------------------------------------

    if frame is None:

        print(
            "[App] Retrying connection in 1.5s ..."
        )

        time.sleep(1.5)

        continue


    # --------------------------------------------------------
    # YOLO DETECTION
    # --------------------------------------------------------

    try:

        results = model(
            frame,
            verbose=False
        )

    except Exception as e:

        print(
            "[YOLO] Detection error:",
            repr(e)
        )

        continue


    # --------------------------------------------------------
    # DRAW YOLO RESULTS
    # --------------------------------------------------------

    annotated_frame = results[0].plot()


    detected_objects = []


    # --------------------------------------------------------
    # PROCESS DETECTIONS
    # --------------------------------------------------------

    for result in results:

        for box in result.boxes:

            confidence = float(
                box.conf[0]
            )

            if confidence < CONFIDENCE_THRESHOLD:

                continue


            class_id = int(
                box.cls[0]
            )


            name = model.names[class_id]


            detected_objects.append(
                name
            )


            # ------------------------------------------------
            # VOICE COOLDOWN
            # ------------------------------------------------

            current_time = time.time()

            last_time = last_announced.get(
                name,
                0
            )


            if (
                current_time - last_time
                >= ANNOUNCE_INTERVAL
            ):

                speak(
                    f"{name} detected"
                )

                last_announced[name] = (
                    current_time
                )


    # --------------------------------------------------------
    # TERMINAL OUTPUT
    # --------------------------------------------------------

    if detected_objects:

        unique_objects = list(
            dict.fromkeys(
                detected_objects
            )
        )

        print(
            "[Detection]",
            ", ".join(unique_objects)
        )

    else:

        print(
            "[Detection] Nothing"
        )


    # --------------------------------------------------------
    # VOICE STATUS
    # --------------------------------------------------------

    voice_status = (
        "VOICE ON"
        if voice_enabled
        else "VOICE OFF"
    )


    cv2.putText(
        annotated_frame,
        voice_status,
        (10, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255, 255, 255),
        2
    )


    # --------------------------------------------------------
    # HELP
    # --------------------------------------------------------

    annotated_frame = draw_help(
        annotated_frame
    )


    # --------------------------------------------------------
    # DISPLAY
    # --------------------------------------------------------

    cv2.imshow(
        "ESP32-CAM Object Detection",
        annotated_frame
    )


    # --------------------------------------------------------
    # KEYBOARD CONTROLS
    # --------------------------------------------------------

    key = cv2.waitKey(1) & 0xFF


    # Q = QUIT
    if key == ord("q"):

        print(
            "[App] Quit requested."
        )

        break


    # V = VOICE
    elif key == ord("v"):

        voice_enabled = not voice_enabled

        if voice_enabled:

            print(
                "[Voice] Voice ENABLED"
            )

        else:

            print(
                "[Voice] Voice DISABLED"
            )


    # S = HELP
    elif key == ord("s"):

        show_help = not show_help


    # R = RECONNECT
    elif key == ord("r"):

        print(
            "[Camera] Reconnecting..."
        )

        try:

            session.close()

        except Exception:
            pass

        session = requests.Session()

        time.sleep(1)


# ============================================================
# CLEANUP
# ============================================================

print()
print("[App] Shutting down...")

cv2.destroyAllWindows()

try:

    session.close()

except Exception:
    pass


speech_queue.put(None)

print("[App] Object detection stopped.")