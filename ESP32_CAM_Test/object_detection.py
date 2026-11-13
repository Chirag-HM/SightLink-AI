#!/usr/bin/env python3
"""
AI Smart Blind Stick — Object Detection & Voice Announcement
============================================================
Polls the ESP32-CAM /capture endpoint, runs YOLOv8 object
detection on each frame, draws bounding boxes, and announces detected
objects via macOS `say` with per-class cooldown timers.

Usage:
    python3 object_detection.py
    python3 object_detection.py --ip 10.235.17.135
    python3 object_detection.py --ip 10.235.17.135 --no-voice

Controls (press in the OpenCV window):
    Q  — quit
    V  — toggle voice on/off
    S  — show/hide help overlay
    R  — reconnect / retry
"""

import argparse
import json
import subprocess
import sys
import time
import threading
import urllib.request
import urllib.error
from collections import defaultdict

import cv2
import numpy as np

# ─── Dependency check ────────────────────────────────────────────────────────
try:
    from ultralytics import YOLO
except ImportError:
    print("ERROR: ultralytics not installed. Run: pip3 install ultralytics")
    sys.exit(1)

# ─── Configuration ────────────────────────────────────────────────────────────
DEFAULT_IP           = "10.206.152.135"
YOLO_MODEL           = "yolov8n.pt"      # nano = fastest (~6 MB)
CONFIDENCE_THRESHOLD = 0.45
COOLDOWN_SECONDS     = 5.0               # seconds between same announcement
DISPLAY_WIDTH        = 800               # window width in pixels
CAPTURE_TIMEOUT      = 3.0               # seconds to wait for each frame
RETRY_DELAY          = 1.5               # seconds between reconnect attempts
FRAME_PACING_SEC     = 0.02              # small yield to avoid saturating ESP32 TCP stack

# Objects to announce (COCO-80 subset relevant to navigation & safety)
ANNOUNCED_CLASSES = {
    "person", "bicycle", "car", "motorcycle", "bus", "truck",
    "chair", "couch", "bed", "dining table", "toilet",
    "bottle", "cup", "bowl",
    "dog", "cat",
    "backpack", "umbrella", "handbag",
    "traffic light", "stop sign",
    "laptop", "keyboard", "cell phone",
    "book", "clock", "stairs"
}

COLOURS = [
    (56, 56, 255), (151, 157, 255), (31, 112, 255), (29, 178, 255), (49, 210, 207),
    (10, 249, 72), (23, 204, 146), (134, 219, 61), (52, 147, 26), (187, 212, 0),
    (168, 153, 44), (255, 194, 0), (147, 69, 52), (255, 115, 100), (236, 24, 0),
    (255, 56, 132), (133, 0, 82), (255, 56, 203), (200, 149, 255), (199, 55, 255),
]


# ─── Voice engine ────────────────────────────────────────────────────────────
class VoiceEngine:
    def __init__(self, enabled=True):
        self.enabled = enabled
        self._lock = threading.Lock()
        self._cooldowns: dict[str, float] = defaultdict(float)

        try:
            import pyttsx3

            self.engine = pyttsx3.init()
            self.engine.setProperty("rate", 165)
            self.engine.setProperty("volume", 1.0)

            print("[Voice] Windows TTS (pyttsx3) initialized")
            print(f"[Voice] {'ON' if self.enabled else 'OFF'}")

        except Exception:
            # Fall back to Windows PowerShell System.Speech SAPI synthesizer in _speak_now
            print("[Voice] Windows TTS (System.Speech SAPI) initialized")
            print(f"[Voice] {'ON' if self.enabled else 'OFF'}")
            self.engine = None

    def toggle(self):
        self.enabled = not self.enabled

        print(f"[Voice] {'ON' if self.enabled else 'OFF'}")

        if self.enabled:
            self.say("Voice on")

    def can_announce(self, label):
        return time.time() - self._cooldowns[label] >= COOLDOWN_SECONDS

    def say(self, text, label=""):
        if not self.enabled:
            return

        if label and not self.can_announce(label):
            return

        if label:
            self._cooldowns[label] = time.time()

        threading.Thread(
            target=self._speak_now,
            args=(text,),
            daemon=True
        ).start()

    def _speak_now(self, text):
        try:
            print(f"[Voice] Speaking: {text}")

            import subprocess

            ps_command = (
                "Add-Type -AssemblyName System.Speech; "
                "$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                "$voice.Speak("
                + repr(text)
                + ");"
            )

            subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    ps_command
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True
            )

        except Exception as e:
            print("[Voice] Speech error:", e)

# ─── Single-frame JPEG fetcher ────────────────────────────────────────────────
class CameraClient:
    """Fetches individual JPEG frames cleanly without socket leaks."""

    def __init__(self, ip: str):
        self.capture_url = f"http://{ip}/capture"

    def check(self) -> bool:
        """Fetch one complete frame to verify the camera is reachable."""
        try:
            req = urllib.request.Request(self.capture_url, headers={"Connection": "close"})
            with urllib.request.urlopen(req, timeout=CAPTURE_TIMEOUT) as resp:
                data = resp.read()
            if len(data) > 1000:
                print(f"[Camera] Connected → {self.capture_url} ({len(data)} bytes)")
                return True
            return False
        except Exception as e:
            print(f"[Camera] Not reachable: {e}")
            return False

    def fetch_frame(self):
        """Returns a decoded BGR frame, or None on failure."""
        try:
            req = urllib.request.Request(self.capture_url, headers={"Connection": "close"})
            with urllib.request.urlopen(req, timeout=CAPTURE_TIMEOUT) as resp:
                data = resp.read()
            if not data:
                return None
            img = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
            return img
        except Exception:
            return None


# ─── Drawing helpers ──────────────────────────────────────────────────────────
def draw_box(frame, x1, y1, x2, y2, label, conf, colour):
    cv2.rectangle(frame, (x1, y1), (x2, y2), colour, 2)
    text = f"{label} {conf:.0%}"
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
    ty = max(y1 - 4, th + 4)
    cv2.rectangle(frame, (x1, ty - th - 4), (x1 + tw + 4, ty + 2), colour, -1)
    cv2.putText(frame, text, (x1 + 2, ty - 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)


def draw_hud(frame, fps, voice_on, det_count, show_help):
    h, _ = frame.shape[:2]
    voice_str = "Voice: ON" if voice_on else "Voice: OFF"
    cv2.putText(frame, f"FPS: {fps:4.1f} | {voice_str} | Objects: {det_count}",
                (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                (0, 255, 120), 2, cv2.LINE_AA)
    if show_help:
        cv2.putText(frame, "[Q] Quit  [V] Voice Toggle  [S] Help  [R] Reconnect",
                    (12, h - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.48,
                    (220, 220, 220), 1, cv2.LINE_AA)


def make_status_frame(msg, sub=""):
    f = np.zeros((480, 640, 3), np.uint8)
    cv2.putText(f, msg, (30, 230), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 200, 255), 2)
    cv2.putText(f, sub, (30, 265), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (160, 160, 160), 1)
    cv2.putText(f, "Press Q to quit, R to retry",
                (30, 310), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (110, 110, 110), 1)
    return f


def publish_detections_async(backend_url: str, detections: list[dict]):
    if not backend_url:
        return

    def _send():
        try:
            payload = json.dumps({
                "detector": "yolov8n",
                "detections": detections,
            }).encode("utf-8")
            req = urllib.request.Request(
                f"{backend_url.rstrip('/')}/api/vision/detections",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=1.5):
                pass
        except Exception:
            pass

    threading.Thread(target=_send, daemon=True).start()


def try_discover_ip_from_backend(backend_url: str) -> str | None:
    if not backend_url:
        return None
    try:
        req = urllib.request.Request(
            f"{backend_url.rstrip('/')}/api/vision/discover?scan_lan=true",
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if data.get("found") and data.get("camera_url"):
            from urllib.parse import urlparse
            parsed = urlparse(data["camera_url"])
            return parsed.netloc
    except Exception:
        pass
    return None


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="AI Blind Stick — Object Detection")
    parser.add_argument("--ip", default=DEFAULT_IP,
                        help=f"ESP32-CAM IP address (default: {DEFAULT_IP})")
    parser.add_argument("--backend", default="http://127.0.0.1:8000",
                        help="SightLink backend URL to stream YOLO detections")
    parser.add_argument("--model", default=YOLO_MODEL)
    parser.add_argument("--conf", type=float, default=CONFIDENCE_THRESHOLD)
    parser.add_argument("--no-voice", action="store_true")
    parser.add_argument("--no-window", action="store_true",
                        help="Run headlessly without opening an OpenCV window")
    args = parser.parse_args()

    # ── Load YOLO ──────────────────────────────────────────────────────────
    print(f"[YOLO] Loading {args.model}...")
    try:
        model = YOLO(args.model)
        class_names = model.names
    except Exception as e:
        print(f"[YOLO] Failed to load model: {e}")
        sys.exit(1)
    print(f"[YOLO] Ready — {len(class_names)} classes supported")

    voice = VoiceEngine(enabled=not args.no_voice)
    camera = CameraClient(args.ip)

    if not args.no_window:
        cv2.namedWindow("AI Blind Stick", cv2.WINDOW_NORMAL)
        cv2.resizeWindow("AI Blind Stick", DISPLAY_WIDTH, int(DISPLAY_WIDTH * 0.75))

    print(f"\n[App] Camera URL: http://{args.ip}/capture")
    print(f"[App] Browser View: http://{args.ip}/")
    print(f"[App] Backend API: {args.backend}/api/vision/detections")
    print(f"[App] Controls: [Q] Quit  [V] Voice  [S] Help  [R] Reconnect\n")

    voice.say("AI Blind Stick started")

    fps = 0.0
    t_fps = time.time()
    fps_count = 0
    show_help = True
    last_dets = 0
    connected = False
    consecutive_fails = 0
    last_publish_at = 0.0

    while True:
        # ── Connect / reconnect ────────────────────────────────────────────
        if not connected:
            if not args.no_window:
                cv2.imshow("AI Blind Stick",
                           make_status_frame("Connecting to ESP32-CAM...",
                                             f"Target: http://{args.ip}/capture"))
                key = cv2.waitKey(1) & 0xFF
                if key == ord("q"):
                    break

            connected = camera.check()
            if not connected:
                discovered_host = try_discover_ip_from_backend(args.backend)
                if discovered_host:
                    args.ip = discovered_host
                    camera = CameraClient(discovered_host)
                    connected = camera.check()

            if not connected:
                print(f"[App] Retrying connection in {RETRY_DELAY}s ...")
                if not args.no_window:
                    cv2.imshow("AI Blind Stick",
                               make_status_frame("Connection failed — retrying...",
                                                 f"Cannot reach {args.ip} on Wi-Fi"))
                    key = cv2.waitKey(int(RETRY_DELAY * 1000)) & 0xFF
                    if key == ord("q"):
                        break
                else:
                    time.sleep(RETRY_DELAY)
                continue

            consecutive_fails = 0
            voice.say("Camera connected")

        # ── Fetch frame ────────────────────────────────────────────────────
        frame = camera.fetch_frame()
        if frame is None:
            consecutive_fails += 1
            if consecutive_fails >= 3:
                print(f"[Camera] {consecutive_fails} consecutive frame drops — reconnecting...")
                connected = False
            time.sleep(0.05)
            continue

        consecutive_fails = 0

        # Small pacing delay so ESP32-CAM network stack isn't overloaded
        if FRAME_PACING_SEC > 0:
            time.sleep(FRAME_PACING_SEC)

        fps_count += 1
        elapsed = time.time() - t_fps
        if elapsed >= 1.0:
            fps = fps_count / elapsed
            t_fps = time.time()
            fps_count = 0

        # ── Run YOLO ───────────────────────────────────────────────────────
        det_count = 0
        announced = set()
        web_detections = []
        fh, fw = frame.shape[:2]
        try:
            results = model(
                frame,
                conf=args.conf,
                imgsz=640,
                verbose=False
            )[0]
            for idx, box in enumerate(results.boxes):
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                label = class_names.get(cls_id, str(cls_id))
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                colour = COLOURS[cls_id % len(COLOURS)]

                draw_box(frame, x1, y1, x2, y2, label, conf, colour)
                det_count += 1

                cx = ((x1 + x2) / 2.0) / max(fw, 1)
                pos = "Left" if cx < 0.35 else ("Right" if cx > 0.65 else "Ahead")
                web_detections.append({
                    "id": f"det-{idx}",
                    "label": label,
                    "confidence": round(conf * 100),
                    "x": round((x1 / max(fw, 1)) * 100, 1),
                    "y": round((y1 / max(fh, 1)) * 100, 1),
                    "w": round(((x2 - x1) / max(fw, 1)) * 100, 1),
                    "h": round(((y2 - y1) / max(fh, 1)) * 100, 1),
                    "position": pos,
                    "color": "#065F46",
                })

                if (label in ANNOUNCED_CLASSES
                        and label not in announced
                        and voice.can_announce(label)):
                    voice.say(f"{label} detected", label=label)
                    announced.add(label)
                    print(f"[Det] {label:18s} {conf:.0%}")

            last_dets = det_count
            now_t = time.time()
            if now_t - last_publish_at >= 0.4:
                last_publish_at = now_t
                publish_detections_async(args.backend, web_detections)
        except Exception as e:
            print(f"[YOLO] Detection error: {e}")

        # ── Display ────────────────────────────────────────────────────────
        if not args.no_window:
            draw_hud(frame, fps, voice.enabled, last_dets, show_help)
            cv2.imshow("AI Blind Stick", frame)

            # ── Key handler ────────────────────────────────────────────────
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord("v"):
                voice.toggle()
            elif key == ord("s"):
                show_help = not show_help
            elif key == ord("r"):
                print("[App] Manual reconnect requested...")
                connected = False

    if not args.no_window:
        cv2.destroyAllWindows()
    print("[App] Finished.")


if __name__ == "__main__":
    main()
