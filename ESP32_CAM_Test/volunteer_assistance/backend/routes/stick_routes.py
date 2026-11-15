import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import ipaddress
import logging
import os
from pathlib import Path
import re
import socket
import subprocess
from typing import Optional
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import Response, StreamingResponse

from ..config import settings
from ..database import SessionLocal
from ..schemas import HardwareButtonEventRequest, StickGPSSync
from ..websockets import notification_hub

logger = logging.getLogger("volunteer_assistance_app")

router = APIRouter(prefix="/api/stick", tags=["ESP8266 Stick Gateway"])
hardware_router = APIRouter(prefix="/api", tags=["Hardware Sensors & Vision"])

# In-memory cached stick coordinates for quick lookup
latest_stick_data = {
    "fix": False,
    "latitude": None,
    "longitude": None,
    "satellites": 0,
    "distance_cm": None,
    "button_pressed": False,
    "source": "uninitialized",
}

stick_config_state = {
    "ip": settings.ESP8266_IP or "10.206.152.89",
    "connected": False,
    "last_checked_at": None,
    "last_error": None,
    "polling_enabled": True,
}

latest_vision_data = {
    "connected": False,
    "detector": "standby",
    "detections": [],
    "updated_at": None,
}

vision_config_state = {
    "camera_url": settings.ESP32_CAM_URL or "http://10.235.17.135/capture",
    "camera_connected": False,
    "last_verified_url": None,
    "last_checked_at": None,
    "last_error": None,
}


def _normalize_camera_url(raw_url: str, default_path: str = "/capture") -> str:
    candidate = (raw_url or "").strip()
    if not candidate:
        raise ValueError("Camera URL is required.")
    if any(ch in candidate for ch in ("\r", "\n", "\x00")):
        raise ValueError("Invalid characters in camera URL.")
    if not re.match(r"^[a-z][a-z\d+.-]*://", candidate, re.IGNORECASE):
        candidate = f"http://{candidate}"
    parsed = urlparse(candidate)
    if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
        raise ValueError("Use a valid http:// or https:// ESP32-CAM URL.")
    path = parsed.path or ""
    if not path or path == "/":
        path = default_path
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{parsed.scheme.lower()}://{parsed.netloc}{path}{query}"


def _probe_esp32_capture(url: str, timeout: float = 1.6) -> tuple[bool, Optional[bytes], Optional[str]]:
    try:
        resp = requests.get(
            url,
            timeout=timeout,
            headers={"Connection": "close", "Accept": "image/jpeg,image/*,*/*"},
        )
        if resp.status_code != 200:
            return False, None, f"HTTP {resp.status_code}"
        ctype = (resp.headers.get("content-type") or "").lower()
        data = resp.content or b""
        is_jpeg = len(data) >= 4 and data[:2] == b"\xff\xd8"
        if is_jpeg or ("image/" in ctype and len(data) > 200):
            return True, data, None
        return False, None, f"Unexpected non-image response ({ctype or 'unknown'})"
    except requests.exceptions.ConnectTimeout:
        return False, None, "Connection timed out"
    except requests.exceptions.ConnectionError as exc:
        return False, None, f"Connection unreachable ({exc})"
    except Exception as exc:
        return False, None, str(exc)


def _tcp_port_open(ip: str, port: int = 80, timeout: float = 0.25) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        return sock.connect_ex((ip, port)) == 0
    except Exception:
        return False
    finally:
        sock.close()


def _get_local_ipv4_subnets() -> list[tuple[str, ipaddress.IPv4Network]]:
    subnets: list[tuple[str, ipaddress.IPv4Network]] = []
    seen_nets: set[str] = set()
    try:
        infos = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
        for info in infos:
            ip = info[4][0]
            if not ip or ip.startswith("127.") or ip.startswith("169.254."):
                continue
            net = ipaddress.IPv4Network(f"{ip}/24", strict=False)
            if str(net) not in seen_nets:
                seen_nets.add(str(net))
                subnets.append((ip, net))
    except Exception:
        pass

    # Also detect active default route interface IP if hostname lookup missed it
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        if local_ip and not local_ip.startswith("127.") and not local_ip.startswith("169.254."):
            net = ipaddress.IPv4Network(f"{local_ip}/24", strict=False)
            if str(net) not in seen_nets:
                seen_nets.add(str(net))
                subnets.append((local_ip, net))
    except Exception:
        pass

    return subnets


def _detect_windows_wifi_hints() -> dict:
    hints: dict = {"pc_wifi_ssid": None, "ap_detected": False, "ap_ssid": "ESP32-CAM-AP", "nearby_ssids": []}
    if os.name != "nt":
        return hints
    try:
        iface_out = subprocess.check_output(
            ["netsh", "wlan", "show", "interfaces"],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=2.0,
        )
        for line in iface_out.splitlines():
            m = re.match(r"^\s*SSID\s*:\s*(.+)$", line)
            if m:
                ssid = m.group(1).strip()
                if ssid:
                    hints["pc_wifi_ssid"] = ssid
                    break
    except Exception:
        pass

    try:
        nets_out = subprocess.check_output(
            ["netsh", "wlan", "show", "networks"],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=2.5,
        )
        ssids = []
        for line in nets_out.splitlines():
            m = re.match(r"^\s*SSID\s+\d+\s*:\s*(.+)$", line)
            if m:
                ssid = m.group(1).strip()
                if ssid:
                    ssids.append(ssid)
        hints["nearby_ssids"] = ssids
        for ssid in ssids:
            if "esp32-cam" in ssid.lower():
                hints["ap_detected"] = True
                hints["ap_ssid"] = ssid
                break
    except Exception:
        pass
    return hints


def _inspect_esp32_cam_firmware_ssid() -> dict:
    """Inspect configured SSID in ESP32_CAM_Test/src/main.cpp vs compiled firmware.bin."""
    info = {"source_ssid": None, "firmware_needs_upload": False}
    try:
        esp_dir = Path(__file__).resolve().parents[3]
        main_cpp = esp_dir / "src" / "main.cpp"
        if main_cpp.exists():
            text = main_cpp.read_text(encoding="utf-8", errors="ignore")
            m = re.search(r'const\s+char\s*\*\s*ssid\s*=\s*"([^"]+)"', text)
            if m:
                info["source_ssid"] = m.group(1)
        firmware_bin = esp_dir / ".pio" / "build" / "esp32cam" / "firmware.bin"
        if info["source_ssid"] and firmware_bin.exists():
            raw = firmware_bin.read_bytes()
            info["firmware_needs_upload"] = info["source_ssid"].encode("utf-8") not in raw
    except Exception:
        pass
    return info


def _discover_esp32_cam_sync(scan_lan: bool = True) -> dict:
    candidates: list[str] = []
    seen: set[str] = set()

    def add_candidate(raw: Optional[str]):
        if not raw:
            return
        try:
            u = _normalize_camera_url(raw)
        except ValueError:
            return
        if u not in seen:
            seen.add(u)
            candidates.append(u)

    add_candidate(vision_config_state.get("camera_url"))
    add_candidate(settings.ESP32_CAM_URL)
    add_candidate("http://192.168.4.1/capture")  # ESP32-CAM SoftAP fallback IP
    add_candidate("http://esp32-cam.local/capture")

    # Prioritize explicit configured URLs first
    for url in list(candidates):
        ok, _, _ = _probe_esp32_capture(url, timeout=1.1)
        if ok:
            now_iso = datetime.now(timezone.utc).isoformat()
            vision_config_state.update({
                "camera_url": url,
                "camera_connected": True,
                "last_verified_url": url,
                "last_checked_at": now_iso,
                "last_error": None,
            })
            return {
                "found": True,
                "camera_url": url,
                "candidates_checked": candidates,
                "pc_wifi_ssid": None,
                "ap_detected": url.startswith("http://192.168.4.1"),
                "ap_ssid": "ESP32-CAM-AP",
                "ap_capture_url": "http://192.168.4.1/capture",
                "message": f"ESP32-CAM responded cleanly at {url}.",
            }

    if scan_lan:
        subnets = _get_local_ipv4_subnets()
        lan_hosts: list[str] = []
        for local_ip, net in subnets[:2]:
            for host in net.hosts():
                host_str = str(host)
                if host_str != local_ip:
                    lan_hosts.append(host_str)

        if lan_hosts:
            with ThreadPoolExecutor(max_workers=64) as pool:
                port80_results = list(pool.map(lambda ip: ip if _tcp_port_open(ip, 80, 0.25) else None, lan_hosts))
            open_ips = [ip for ip in port80_results if ip]
            for ip in open_ips:
                add_candidate(f"http://{ip}/capture")

            for ip in open_ips:
                url = f"http://{ip}/capture"
                ok, _, _ = _probe_esp32_capture(url, timeout=1.2)
                if ok:
                    now_iso = datetime.now(timezone.utc).isoformat()
                    vision_config_state.update({
                        "camera_url": url,
                        "camera_connected": True,
                        "last_verified_url": url,
                        "last_checked_at": now_iso,
                        "last_error": None,
                    })
                    return {
                        "found": True,
                        "camera_url": url,
                        "candidates_checked": candidates,
                        "pc_wifi_ssid": None,
                        "ap_detected": False,
                        "ap_ssid": "ESP32-CAM-AP",
                        "ap_capture_url": "http://192.168.4.1/capture",
                        "message": f"ESP32-CAM discovered on your LAN at {url}.",
                    }

    wifi_hints = _detect_windows_wifi_hints()
    fw_info = _inspect_esp32_cam_firmware_ssid()
    pc_ssid = wifi_hints.get("pc_wifi_ssid")
    ap_detected = bool(wifi_hints.get("ap_detected"))
    ap_ssid = wifi_hints.get("ap_ssid") or "ESP32-CAM-AP"
    source_ssid = fw_info.get("source_ssid")
    firmware_needs_upload = bool(fw_info.get("firmware_needs_upload"))

    if ap_detected:
        extra = (
            f" Note: ESP32_CAM_Test/src/main.cpp has '{source_ssid}', which is not compiled into "
            "firmware.bin yet — upload it over USB so the camera joins your new hotspot."
            if firmware_needs_upload and source_ssid
            else f" Or turn on hotspot '{source_ssid}' and click Scan Network."
            if source_ssid
            else ""
        )
        msg = (
            f"ESP32-CAM is powered ON and broadcasting Wi-Fi '{ap_ssid}' nearby, while this PC is on "
            f"'{pc_ssid or 'another network'}'. Connect Wi-Fi to '{ap_ssid}' (password: 12345678, "
            f"capture URL http://192.168.4.1/capture).{extra}"
        )
    elif firmware_needs_upload and source_ssid:
        msg = (
            f"No ESP32-CAM responded on {pc_ssid or 'the active LAN'} or at http://192.168.4.1/capture. "
            f"ESP32_CAM_Test/src/main.cpp was updated to '{source_ssid}', but the compiled firmware.bin "
            "still contains an older hotspot — compile and upload src/main.cpp to the ESP32-CAM via USB, "
            "and make sure the board is powered on."
        )
    else:
        msg = (
            f"No ESP32-CAM responded on {pc_ssid or 'the active LAN'} or at http://192.168.4.1/capture. "
            "Check ESP32-CAM power and verify both this PC and the ESP32-CAM share the same 2.4 GHz Wi-Fi hotspot."
        )

    vision_config_state.update({
        "camera_connected": False,
        "last_checked_at": datetime.now(timezone.utc).isoformat(),
        "last_error": msg,
    })
    return {
        "found": False,
        "camera_url": None,
        "candidates_checked": candidates,
        "pc_wifi_ssid": pc_ssid,
        "ap_detected": ap_detected,
        "ap_ssid": ap_ssid,
        "ap_capture_url": "http://192.168.4.1/capture",
        "source_ssid": source_ssid,
        "firmware_needs_upload": firmware_needs_upload,
        "message": msg,
    }


@router.get("/gps", response_model=StickGPSSync)
def fetch_esp8266_gps(ip: str = Query(default=settings.ESP8266_IP)):
    """
    Directly query the existing, unmodified ESP8266 Smart Blind Stick
    firmware endpoint at http://<ESP_IP>/gps or /status.
    """
    url = f"http://{ip}/status"
    try:
        resp = requests.get(url, timeout=settings.ESP8266_TIMEOUT_SECONDS)
        if resp.status_code == 200:
            data = resp.json()
            has_fix = bool(data.get("gps_fix", False))
            lat = data.get("latitude")
            lon = data.get("longitude")

            latest_stick_data["fix"] = has_fix and (lat is not None) and (lon is not None)
            latest_stick_data["latitude"] = float(lat) if lat is not None else None
            latest_stick_data["longitude"] = float(lon) if lon is not None else None
            latest_stick_data["satellites"] = int(data.get("satellites", 0))
            latest_stick_data["distance_cm"] = float(data.get("distance_cm", 999.0))
            latest_stick_data["button_pressed"] = bool(data.get("button", False))
            latest_stick_data["source"] = f"esp8266@{ip}"

            return StickGPSSync(**latest_stick_data)
    except Exception:
        try:
            resp2 = requests.get(f"http://{ip}/gps", timeout=settings.ESP8266_TIMEOUT_SECONDS)
            if resp2.status_code == 200:
                d = resp2.json()
                has_fix = bool(d.get("fix", False))
                lat = d.get("latitude")
                lon = d.get("longitude")
                latest_stick_data["fix"] = has_fix and (lat is not None) and (lon is not None)
                latest_stick_data["latitude"] = float(lat) if lat is not None else None
                latest_stick_data["longitude"] = float(lon) if lon is not None else None
                latest_stick_data["satellites"] = int(d.get("satellites", 0))
                latest_stick_data["source"] = f"esp8266@{ip}"
                return StickGPSSync(**latest_stick_data)
        except Exception:
            pass

    return StickGPSSync(
        fix=latest_stick_data.get("fix", False),
        latitude=latest_stick_data.get("latitude"),
        longitude=latest_stick_data.get("longitude"),
        satellites=latest_stick_data.get("satellites", 0),
        distance_cm=latest_stick_data.get("distance_cm"),
        button_pressed=latest_stick_data.get("button_pressed"),
    )


@router.post("/gps-sync")
def sync_stick_gps(data: StickGPSSync):
    """Companion endpoint for external scripts to push ESP8266 GPS packets."""
    latest_stick_data.update(data.model_dump())
    latest_stick_data["source"] = "push_sync"
    return {"status": "synced", "latest": latest_stick_data}


@router.get("/config")
def get_stick_config():
    """Return current configured ESP8266 IP and live connection telemetry."""
    return {
        "ip": stick_config_state["ip"],
        "connected": bool(stick_config_state.get("connected")),
        "last_checked_at": stick_config_state.get("last_checked_at"),
        "last_error": stick_config_state.get("last_error"),
        "polling_enabled": bool(stick_config_state.get("polling_enabled")),
        "latest_data": latest_stick_data,
    }


@router.post("/config")
def update_stick_config(payload: dict = Body(default_factory=dict)):
    """Update ESP8266 stick IP or toggle polling without restarting backend."""
    raw_ip = str(payload.get("ip") or "").strip()
    if raw_ip:
        if "://" in raw_ip:
            raw_ip = urlparse(raw_ip).netloc or raw_ip
        raw_ip = raw_ip.split(":")[0].strip()
        stick_config_state["ip"] = raw_ip
    if "polling_enabled" in payload:
        stick_config_state["polling_enabled"] = bool(payload["polling_enabled"])
    return get_stick_config()


async def monitor_esp8266_stick():
    """
    Continuous background bridge for the 3 physical buttons on the ESP8266:
    - Button 1 (D5): Bus route query -> relays 'bus_assistant' action
    - Button 2 (D6): Voice assistance -> relays 'single_press' action
    - Button 3 (D7): Emergency SOS -> relays 'long_press' action with stick GPS
    """
    from .assistant_routes import process_hardware_button_event

    logger.info("ESP8266 Smart Blind Stick background bridge active.")
    last_hw_press = {"bus": 0.0, "ai": 0.0, "sos": 0.0}

    while True:
        try:
            if not stick_config_state.get("polling_enabled", True):
                await asyncio.sleep(1.0)
                continue

            ip = (stick_config_state.get("ip") or settings.ESP8266_IP or "").strip()
            if "://" in ip:
                ip = urlparse(ip).netloc or ip
            if ":" in ip:
                ip = ip.split(":")[0]
            if not ip:
                await asyncio.sleep(2.0)
                continue

            loop = asyncio.get_running_loop()
            status_data = None
            try:
                def _do_get():
                    return requests.get(f"http://{ip}/status", timeout=2.0)
                resp = await loop.run_in_executor(None, _do_get)
                if resp.status_code == 200:
                    status_data = resp.json()
            except Exception as e:
                stick_config_state["connected"] = False
                stick_config_state["last_error"] = str(e)

            if status_data and isinstance(status_data, dict):
                stick_config_state["connected"] = True
                stick_config_state["last_checked_at"] = datetime.now(timezone.utc).isoformat()
                stick_config_state["last_error"] = None

                lat = status_data.get("latitude")
                lon = status_data.get("longitude")
                has_fix = bool(status_data.get("gps_fix", False)) and (lat is not None) and (lon is not None)
                latest_stick_data["fix"] = has_fix
                latest_stick_data["latitude"] = float(lat) if lat is not None else None
                latest_stick_data["longitude"] = float(lon) if lon is not None else None
                latest_stick_data["satellites"] = int(status_data.get("satellites", 0))
                latest_stick_data["distance_cm"] = float(status_data.get("distance_cm", 999.0))
                latest_stick_data["source"] = f"esp8266@{ip}"

                bus_pressed = bool(status_data.get("bus_button", False))
                ai_pressed = bool(status_data.get("ai_button", False))
                sos_pressed = bool(status_data.get("sos_button", False))
                now_ts = loop.time()

                if bus_pressed and (now_ts - last_hw_press["bus"] > 1.2):
                    last_hw_press["bus"] = now_ts
                    logger.info("ESP8266 Hardware Bus Button (D5) pressed!")
                    def _clear_bus():
                        try:
                            requests.get(f"http://{ip}/button", timeout=1.0)
                        except Exception:
                            pass
                    await loop.run_in_executor(None, _clear_bus)
                    db = SessionLocal()
                    try:
                        req_obj = HardwareButtonEventRequest(
                            action="bus_assistant",
                            device_id=f"esp8266@{ip}",
                            source="esp8266_hardware",
                            latitude=latest_stick_data["latitude"],
                            longitude=latest_stick_data["longitude"],
                        )
                        await process_hardware_button_event(req_obj, db)
                    finally:
                        db.close()

                if ai_pressed and (now_ts - last_hw_press["ai"] > 1.2):
                    last_hw_press["ai"] = now_ts
                    logger.info("ESP8266 Hardware AI Voice Button (D6) pressed!")
                    def _clear_ai():
                        try:
                            requests.get(f"http://{ip}/ai-button", timeout=1.0)
                        except Exception:
                            pass
                    await loop.run_in_executor(None, _clear_ai)
                    db = SessionLocal()
                    try:
                        req_obj = HardwareButtonEventRequest(
                            action="single_press",
                            device_id=f"esp8266@{ip}",
                            source="esp8266_hardware",
                            latitude=latest_stick_data["latitude"],
                            longitude=latest_stick_data["longitude"],
                        )
                        await process_hardware_button_event(req_obj, db)
                    finally:
                        db.close()

                if sos_pressed and (now_ts - last_hw_press["sos"] > 1.2):
                    last_hw_press["sos"] = now_ts
                    logger.info("ESP8266 Hardware SOS Button (D7) pressed!")
                    def _clear_sos():
                        try:
                            requests.get(f"http://{ip}/sos-button", timeout=1.0)
                        except Exception:
                            pass
                    await loop.run_in_executor(None, _clear_sos)
                    db = SessionLocal()
                    try:
                        req_obj = HardwareButtonEventRequest(
                            action="long_press",
                            device_id=f"esp8266@{ip}",
                            source="esp8266_hardware",
                            latitude=latest_stick_data["latitude"],
                            longitude=latest_stick_data["longitude"],
                        )
                        await process_hardware_button_event(req_obj, db)
                    finally:
                        db.close()

                await asyncio.sleep(0.2)
            else:
                await asyncio.sleep(1.5)

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.debug(f"ESP8266 stick bridge loop warning: {exc}")
            await asyncio.sleep(1.5)


@hardware_router.get("/ultrasonic/distance")
def get_ultrasonic_distance():
    """Return latest reported ultrasonic distance (or standby when stick hardware is offline)."""
    raw_cm = latest_stick_data.get("distance_cm")
    valid = raw_cm is not None and 0 <= float(raw_cm) < 900
    return {
        "connected": latest_stick_data.get("source") != "uninitialized",
        "distance": round(float(raw_cm) / 100.0, 2) if valid else None,
        "distance_cm": float(raw_cm) if valid else None,
        "source": latest_stick_data.get("source", "uninitialized"),
        "status": "live" if valid else "standby",
    }


@hardware_router.get("/vision/config")
def get_vision_config():
    return {
        "camera_url": vision_config_state["camera_url"],
        "camera_connected": bool(vision_config_state.get("camera_connected")),
        "last_verified_url": vision_config_state.get("last_verified_url"),
        "last_checked_at": vision_config_state.get("last_checked_at"),
        "last_error": vision_config_state.get("last_error"),
    }


@hardware_router.post("/vision/config")
def update_vision_config(payload: dict = Body(default_factory=dict)):
    raw = str(payload.get("camera_url") or "").strip()
    try:
        clean_url = _normalize_camera_url(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    vision_config_state["camera_url"] = clean_url
    probe = bool(payload.get("probe", True))
    if probe:
        ok, _, err = _probe_esp32_capture(clean_url, timeout=min(settings.ESP32_CAM_TIMEOUT_SECONDS, 2.0))
        vision_config_state["camera_connected"] = ok
        vision_config_state["last_checked_at"] = datetime.now(timezone.utc).isoformat()
        if ok:
            vision_config_state["last_verified_url"] = clean_url
            vision_config_state["last_error"] = None
        else:
            vision_config_state["last_error"] = err
    return get_vision_config()


@hardware_router.post("/vision/discover")
@hardware_router.get("/vision/discover")
async def discover_esp32_camera(scan_lan: bool = Query(default=True)):
    """Scan local LAN subnets + SoftAP 192.168.4.1 and detect ESP32-CAM Wi-Fi status."""
    return await asyncio.to_thread(_discover_esp32_cam_sync, scan_lan)


@hardware_router.get("/vision/capture")
async def proxy_esp32_capture(url: Optional[str] = Query(default=None)):
    """Same-origin JPEG snapshot proxy to avoid browser CORS / Private Network blocks."""
    raw_target = (url or vision_config_state["camera_url"] or "").strip()
    try:
        target_url = _normalize_camera_url(raw_target)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    ok, data, err = await asyncio.to_thread(
        _probe_esp32_capture,
        target_url,
        min(settings.ESP32_CAM_TIMEOUT_SECONDS, 2.5),
    )
    now_iso = datetime.now(timezone.utc).isoformat()
    vision_config_state["last_checked_at"] = now_iso
    if not ok or not data:
        vision_config_state["camera_connected"] = False
        vision_config_state["last_error"] = err or "ESP32-CAM snapshot unreachable"
        raise HTTPException(status_code=502, detail=f"ESP32-CAM unreachable at {target_url}: {err}")

    vision_config_state["camera_url"] = target_url
    vision_config_state["camera_connected"] = True
    vision_config_state["last_verified_url"] = target_url
    vision_config_state["last_error"] = None
    return Response(
        content=data,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@hardware_router.get("/vision/stream")
async def proxy_esp32_mjpeg_stream(url: Optional[str] = Query(default=None)):
    """Same-origin MJPEG multipart stream built cleanly from ESP32-CAM /capture snapshots."""
    raw_target = (url or vision_config_state["camera_url"] or "").strip()
    try:
        target_url = _normalize_camera_url(raw_target)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    async def frame_generator():
        consecutive_failures = 0
        while consecutive_failures < 8:
            ok, frame_bytes, _ = await asyncio.to_thread(_probe_esp32_capture, target_url, 2.0)
            if ok and frame_bytes:
                consecutive_failures = 0
                vision_config_state["camera_connected"] = True
                vision_config_state["last_verified_url"] = target_url
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    + f"Content-Length: {len(frame_bytes)}\r\n\r\n".encode("ascii")
                    + frame_bytes
                    + b"\r\n"
                )
                await asyncio.sleep(0.12)
            else:
                consecutive_failures += 1
                await asyncio.sleep(0.4)

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store"},
    )


@hardware_router.get("/vision/detections")
def get_vision_detections():
    """Return latest ESP32-CAM / YOLO object detections (empty standby until camera pipeline publishes)."""
    updated_at = latest_vision_data.get("updated_at")
    connected = bool(latest_vision_data.get("connected"))
    detections = latest_vision_data.get("detections", [])

    # Expire stale YOLO detections if worker hasn't reported in 10 seconds
    if connected and updated_at:
        try:
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(updated_at)).total_seconds()
            if age > 10.0:
                connected = False
                detections = []
        except Exception:
            pass

    return {
        "connected": connected,
        "detector": latest_vision_data.get("detector", "standby") if connected else "standby",
        "detections": detections,
        "updated_at": updated_at,
        "camera_url": vision_config_state["camera_url"],
        "camera_connected": bool(vision_config_state.get("camera_connected")),
    }


@hardware_router.post("/vision/detections")
def publish_vision_detections(payload: dict = Body(default_factory=dict)):
    """Publish live YOLOv8 detections from an ESP32-CAM detector worker."""
    detections = payload.get("detections") if isinstance(payload, dict) else []
    if not isinstance(detections, list):
        detections = []
    latest_vision_data["connected"] = True
    latest_vision_data["detector"] = str(payload.get("detector") or "yolov8")
    latest_vision_data["detections"] = detections
    latest_vision_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    return {"status": "updated", **latest_vision_data}


@hardware_router.get("/vision/status")
def get_vision_status():
    det_state = get_vision_detections()
    return {
        "connected": det_state["connected"],
        "detector": det_state["detector"],
        "detection_count": len(det_state["detections"]),
        "updated_at": det_state["updated_at"],
        "camera_url": vision_config_state["camera_url"],
        "camera_connected": bool(vision_config_state.get("camera_connected")),
        "last_verified_url": vision_config_state.get("last_verified_url"),
        "last_error": vision_config_state.get("last_error"),
    }
