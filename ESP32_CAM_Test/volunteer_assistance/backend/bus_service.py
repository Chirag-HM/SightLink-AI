import asyncio
import csv
import io
import json
import logging
import os
import struct
import time
import zipfile
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import requests

from .config import settings
from .geospatial import haversine_distance_km
from .routes import bmtc_routes

logger = logging.getLogger("bus_service")

_DEFAULT_MOCK_PATH = Path(__file__).resolve().parent / "data" / "mock_bus_feeds.json"
_BENGALURU_CENTER = (12.9716, 77.5946)


# ── Lightweight Protobuf Wire Decoder for GTFS-Realtime Feeds ─────────────────
def _read_varint(buf: bytes, pos: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while pos < len(buf):
        b = buf[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if not (b & 0x80):
            return result, pos
        shift += 7
    raise ValueError("Truncated varint in protobuf stream")


def _parse_wire_fields(buf: bytes) -> dict[int, list[tuple[int, Any]]]:
    fields: dict[int, list[tuple[int, Any]]] = {}
    pos = 0
    n = len(buf)
    while pos < n:
        tag, pos = _read_varint(buf, pos)
        field_no = tag >> 3
        wire_type = tag & 0x07
        if wire_type == 0:
            val, pos = _read_varint(buf, pos)
        elif wire_type == 1:
            val = buf[pos:pos + 8]
            pos += 8
        elif wire_type == 2:
            length, pos = _read_varint(buf, pos)
            val = buf[pos:pos + length]
            pos += length
        elif wire_type == 5:
            val = buf[pos:pos + 4]
            pos += 4
        else:
            break
        fields.setdefault(field_no, []).append((wire_type, val))
    return fields


def _decode_str(fields: dict, field_no: int) -> Optional[str]:
    for wt, val in fields.get(field_no, []):
        if wt == 2 and isinstance(val, (bytes, bytearray)):
            return val.decode("utf-8", errors="replace")
    return None


def _decode_int(fields: dict, field_no: int) -> Optional[int]:
    for wt, val in fields.get(field_no, []):
        if wt == 0:
            return int(val)
    return None


def _decode_float32(fields: dict, field_no: int) -> Optional[float]:
    for wt, val in fields.get(field_no, []):
        if wt == 5 and isinstance(val, (bytes, bytearray)) and len(val) == 4:
            return float(struct.unpack("<f", val)[0])
    return None


def parse_gtfs_rt_feed(raw_bytes: bytes) -> dict:
    """Parse either JSON-encoded or Protobuf binary GTFS-Realtime FeedMessage."""
    stripped = raw_bytes.lstrip()
    if stripped.startswith(b"{"):
        parsed = json.loads(stripped.decode("utf-8"))
        return {"format": "json", "entities": parsed.get("entity", parsed.get("entities", []))}

    root = _parse_wire_fields(raw_bytes)
    entities = []
    for wt, ent_bytes in root.get(2, []):
        if wt != 2:
            continue
        ef = _parse_wire_fields(ent_bytes)
        ent: dict[str, Any] = {"id": _decode_str(ef, 1) or ""}

        # Field 3 = trip_update
        for tu_wt, tu_bytes in ef.get(3, []):
            if tu_wt != 2:
                continue
            tuf = _parse_wire_fields(tu_bytes)
            trip_desc = {}
            for td_wt, td_bytes in tuf.get(1, []):
                if td_wt == 2:
                    tdf = _parse_wire_fields(td_bytes)
                    trip_desc = {
                        "trip_id": _decode_str(tdf, 1),
                        "route_id": _decode_str(tdf, 5),
                    }
            updates = []
            for st_wt, st_bytes in tuf.get(2, []):
                if st_wt != 2:
                    continue
                stf = _parse_wire_fields(st_bytes)
                arr_time = None
                for ar_wt, ar_bytes in stf.get(2, []):
                    if ar_wt == 2:
                        arf = _parse_wire_fields(ar_bytes)
                        arr_time = _decode_int(arf, 2)
                if arr_time is None:
                    for dp_wt, dp_bytes in stf.get(3, []):
                        if dp_wt == 2:
                            dpf = _parse_wire_fields(dp_bytes)
                            arr_time = _decode_int(dpf, 2)
                updates.append({
                    "stop_id": _decode_str(stf, 4),
                    "arrival": {"time": arr_time} if arr_time is not None else {},
                })
            veh_desc = {}
            for vd_wt, vd_bytes in tuf.get(3, []):
                if vd_wt == 2:
                    vdf = _parse_wire_fields(vd_bytes)
                    veh_desc = {"id": _decode_str(vdf, 1), "label": _decode_str(vdf, 2)}
            ent["trip_update"] = {
                "trip": trip_desc,
                "stop_time_update": updates,
                "vehicle": veh_desc,
            }

        # Field 4 = vehicle (VehiclePosition)
        for vp_wt, vp_bytes in ef.get(4, []):
            if vp_wt != 2:
                continue
            vpf = _parse_wire_fields(vp_bytes)
            trip_desc = {}
            for td_wt, td_bytes in vpf.get(1, []):
                if td_wt == 2:
                    tdf = _parse_wire_fields(td_bytes)
                    trip_desc = {
                        "trip_id": _decode_str(tdf, 1),
                        "route_id": _decode_str(tdf, 5),
                    }
            pos = {}
            for p_wt, p_bytes in vpf.get(2, []):
                if p_wt == 2:
                    pf = _parse_wire_fields(p_bytes)
                    pos = {
                        "latitude": _decode_float32(pf, 1),
                        "longitude": _decode_float32(pf, 2),
                        "bearing": _decode_float32(pf, 3),
                    }
            veh_desc = {}
            for vd_wt, vd_bytes in vpf.get(8, []):
                if vd_wt == 2:
                    vdf = _parse_wire_fields(vd_bytes)
                    veh_desc = {"id": _decode_str(vdf, 1), "label": _decode_str(vdf, 2)}
            ent["vehicle"] = {
                "trip": trip_desc,
                "position": pos,
                "vehicle": veh_desc,
                "stop_id": _decode_str(vpf, 7),
                "timestamp": _decode_int(vpf, 5),
            }
        entities.append(ent)
    return {"format": "protobuf", "entities": entities}


# ── Pluggable BusProvider Interface ───────────────────────────────────────────
class BusProvider(ABC):
    name: str = "base"

    @abstractmethod
    def is_configured(self) -> bool:
        ...

    @abstractmethod
    async def lookup_route(
        self,
        route_number: str,
        lat: Optional[float],
        lng: Optional[float],
        city: Optional[str] = None,
    ) -> Optional[dict]:
        ...

    async def nearest_stop(self, lat: float, lng: float) -> Optional[dict]:
        return None


# ── Adapter 1: GTFS Static + GTFS-Realtime Agency Provider ────────────────────
class GTFSBusProvider(BusProvider):
    name = "gtfs"

    def __init__(self):
        self._static_cache: Optional[dict] = None
        self._static_loaded_at: float = 0.0

    def is_configured(self) -> bool:
        return bool(
            (settings.GTFS_STATIC_DIR or "").strip()
            or (settings.GTFS_STATIC_ZIP_URL or "").strip()
            or (settings.GTFS_RT_TRIP_UPDATES_URL or "").strip()
            or (settings.GTFS_RT_VEHICLE_POSITIONS_URL or "").strip()
        )

    def _headers(self) -> dict:
        hdrs = {"User-Agent": "SightLinkAI/2.0 (accessibility-transit)"}
        if settings.GTFS_API_KEY:
            hdrs[settings.GTFS_API_KEY_HEADER or "Authorization"] = settings.GTFS_API_KEY
        return hdrs

    def _read_csv_files_from_dir(self, dir_path: Path) -> dict:
        data: dict[str, list[dict]] = {}
        for fname in ("stops.txt", "routes.txt", "trips.txt", "stop_times.txt"):
            fpath = dir_path / fname
            if fpath.is_file():
                with open(fpath, "r", encoding="utf-8-sig", newline="") as f:
                    data[fname] = list(csv.DictReader(f))
        return data

    def _read_csv_files_from_zip_bytes(self, content: bytes) -> dict:
        data: dict[str, list[dict]] = {}
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            names = {os.path.basename(n): n for n in zf.namelist()}
            for fname in ("stops.txt", "routes.txt", "trips.txt", "stop_times.txt"):
                if fname in names:
                    with zf.open(names[fname]) as member:
                        text_io = io.TextIOWrapper(member, encoding="utf-8-sig", newline="")
                        data[fname] = list(csv.DictReader(text_io))
        return data

    def _load_static_sync(self) -> dict:
        now = time.monotonic()
        if self._static_cache is not None and (now - self._static_loaded_at) < 3600:
            return self._static_cache

        raw_tables: dict[str, list[dict]] = {}
        if settings.GTFS_STATIC_DIR and os.path.isdir(settings.GTFS_STATIC_DIR):
            raw_tables = self._read_csv_files_from_dir(Path(settings.GTFS_STATIC_DIR))
        elif settings.GTFS_STATIC_ZIP_URL:
            resp = requests.get(settings.GTFS_STATIC_ZIP_URL, headers=self._headers(), timeout=12)
            resp.raise_for_status()
            raw_tables = self._read_csv_files_from_zip_bytes(resp.content)

        stops_by_id: dict[str, dict] = {}
        for row in raw_tables.get("stops.txt", []):
            sid = (row.get("stop_id") or "").strip()
            if not sid:
                continue
            try:
                lat_v = float(row["stop_lat"])
                lng_v = float(row["stop_lon"])
            except Exception:
                continue
            stops_by_id[sid] = {
                "stop_id": sid,
                "name": (row.get("stop_name") or sid).strip(),
                "latitude": lat_v,
                "longitude": lng_v,
            }

        routes_by_id: dict[str, dict] = {}
        routes_by_short: dict[str, str] = {}
        for row in raw_tables.get("routes.txt", []):
            rid = (row.get("route_id") or "").strip()
            short = (row.get("route_short_name") or rid).strip().upper()
            if rid:
                routes_by_id[rid] = {
                    "route_id": rid,
                    "short_name": short,
                    "long_name": (row.get("route_long_name") or "").strip(),
                }
                routes_by_short[short] = rid

        trips_by_id: dict[str, dict] = {}
        route_trips: dict[str, set[str]] = {}
        for row in raw_tables.get("trips.txt", []):
            tid = (row.get("trip_id") or "").strip()
            rid = (row.get("route_id") or "").strip()
            if tid and rid:
                trips_by_id[tid] = {
                    "trip_id": tid,
                    "route_id": rid,
                    "headsign": (row.get("trip_headsign") or "").strip(),
                }
                route_trips.setdefault(rid, set()).add(tid)

        stop_times_by_trip: dict[str, list[dict]] = {}
        for row in raw_tables.get("stop_times.txt", []):
            tid = (row.get("trip_id") or "").strip()
            sid = (row.get("stop_id") or "").strip()
            if tid and sid:
                stop_times_by_trip.setdefault(tid, []).append({
                    "stop_id": sid,
                    "arrival_time": (row.get("arrival_time") or row.get("departure_time") or "").strip(),
                })

        self._static_cache = {
            "stops": stops_by_id,
            "routes": routes_by_id,
            "routes_by_short": routes_by_short,
            "trips": trips_by_id,
            "route_trips": route_trips,
            "stop_times_by_trip": stop_times_by_trip,
        }
        self._static_loaded_at = now
        return self._static_cache

    def _fetch_rt_sync(self, url: Optional[str]) -> list[dict]:
        if not url:
            return []
        resp = requests.get(url, headers=self._headers(), timeout=8)
        resp.raise_for_status()
        return parse_gtfs_rt_feed(resp.content).get("entities", [])

    async def nearest_stop(self, lat: float, lng: float) -> Optional[dict]:
        if not (settings.GTFS_STATIC_DIR or settings.GTFS_STATIC_ZIP_URL):
            return None
        static = await asyncio.to_thread(self._load_static_sync)
        best = None
        best_km = 1e9
        for stop in static["stops"].values():
            km = haversine_distance_km(lat, lng, stop["latitude"], stop["longitude"])
            if km < best_km:
                best_km = km
                best = {**stop, "distance_m": round(km * 1000)}
        return best

    async def lookup_route(
        self,
        route_number: str,
        lat: Optional[float],
        lng: Optional[float],
        city: Optional[str] = None,
    ) -> Optional[dict]:
        if not self.is_configured():
            return None
        if city and settings.GTFS_CITY_NAME and city.strip().lower() not in (
            settings.GTFS_CITY_NAME.strip().lower(),
            "current",
            "local",
        ):
            return None

        route_upper = route_number.strip().upper()
        static = await asyncio.to_thread(self._load_static_sync) if (
            settings.GTFS_STATIC_DIR or settings.GTFS_STATIC_ZIP_URL
        ) else {"stops": {}, "routes": {}, "routes_by_short": {}, "trips": {}, "route_trips": {}, "stop_times_by_trip": {}}

        target_route_id = static["routes_by_short"].get(route_upper) or (
            route_upper if route_upper in static["routes"] else None
        )

        trip_updates, vehicle_positions = await asyncio.gather(
            asyncio.to_thread(self._fetch_rt_sync, settings.GTFS_RT_TRIP_UPDATES_URL),
            asyncio.to_thread(self._fetch_rt_sync, settings.GTFS_RT_VEHICLE_POSITIONS_URL),
        )

        now_epoch = int(datetime.now(timezone.utc).timestamp())
        matching_arrivals: list[dict] = []
        matching_vehicles: list[dict] = []

        # Collect GTFS-RT TripUpdates matching route
        for ent in trip_updates:
            tu = ent.get("trip_update") or {}
            trip = tu.get("trip") or {}
            t_id = trip.get("trip_id")
            r_id = (trip.get("route_id") or "").strip().upper()
            static_trip = static["trips"].get(t_id, {})
            resolved_rid = (target_route_id or route_upper).upper()
            trip_route_short = static["routes"].get(static_trip.get("route_id", ""), {}).get("short_name", "").upper()

            if r_id not in (route_upper, resolved_rid) and trip_route_short != route_upper and (
                not target_route_id or static_trip.get("route_id") != target_route_id
            ):
                continue

            headsign = static_trip.get("headsign") or static["routes"].get(static_trip.get("route_id", ""), {}).get("long_name") or "City Route"
            veh = tu.get("vehicle") or {}
            for stu in tu.get("stop_time_update", []):
                arr = (stu.get("arrival") or {}).get("time") or (stu.get("departure") or {}).get("time")
                if not arr:
                    continue
                eta_min = max(1, int(round((int(arr) - now_epoch) / 60)))
                if eta_min > 180 or eta_min < 0:
                    continue
                sid = stu.get("stop_id") or ""
                stop_obj = static["stops"].get(sid, {"stop_id": sid, "name": sid or "Nearest Stop"})
                dist_km = None
                if lat is not None and lng is not None and stop_obj.get("latitude") is not None:
                    dist_km = haversine_distance_km(lat, lng, stop_obj["latitude"], stop_obj["longitude"])
                matching_arrivals.append({
                    "route": route_upper,
                    "stop_id": sid,
                    "stop_name": stop_obj.get("name") or "Transit Stop",
                    "direction": headsign,
                    "eta_minutes": eta_min,
                    "distance_km": round(dist_km, 3) if dist_km is not None else None,
                    "vehicle_id": veh.get("id") or t_id,
                    "bus_number": veh.get("label") or veh.get("id") or route_upper,
                    "latitude": stop_obj.get("latitude"),
                    "longitude": stop_obj.get("longitude"),
                    "live": True,
                })

        # Collect GTFS-RT VehiclePositions matching route
        for ent in vehicle_positions:
            vp = ent.get("vehicle") or {}
            trip = vp.get("trip") or {}
            t_id = trip.get("trip_id")
            r_id = (trip.get("route_id") or "").strip().upper()
            static_trip = static["trips"].get(t_id, {})
            trip_route_short = static["routes"].get(static_trip.get("route_id", ""), {}).get("short_name", "").upper()
            if r_id != route_upper and trip_route_short != route_upper and (
                not target_route_id or static_trip.get("route_id") != target_route_id
            ):
                continue
            pos = vp.get("position") or {}
            v_lat = pos.get("latitude")
            v_lng = pos.get("longitude")
            dist_km = None
            eta_est = None
            if lat is not None and lng is not None and v_lat is not None and v_lng is not None:
                dist_km = round(haversine_distance_km(lat, lng, float(v_lat), float(v_lng)), 3)
                eta_est = max(1, int(round((dist_km / 20.0) * 60)))
            sid = vp.get("stop_id") or ""
            stop_obj = static["stops"].get(sid, {})
            veh = vp.get("vehicle") or {}
            matching_vehicles.append({
                "route": route_upper,
                "stop_id": sid or None,
                "stop_name": stop_obj.get("name") or "Nearby Stop",
                "direction": static_trip.get("headsign") or "Active Route",
                "eta_minutes": eta_est,
                "distance_km": dist_km,
                "vehicle_id": veh.get("id") or ent.get("id"),
                "bus_number": veh.get("label") or veh.get("id") or f"Bus {route_upper}",
                "latitude": v_lat,
                "longitude": v_lng,
                "heading": pos.get("bearing") or 0,
                "live": True,
            })

        # Pick nearest matching stop arrival first, else vehicle positions, else static scheduled times
        if matching_arrivals:
            matching_arrivals.sort(
                key=lambda x: (
                    x["distance_km"] if x["distance_km"] is not None else 999.0,
                    x["eta_minutes"],
                )
            )
            primary = matching_arrivals[0]
            same_stop_etas = sorted(
                {a["eta_minutes"] for a in matching_arrivals if a["stop_name"] == primary["stop_name"]}
            )[:3]
            return {
                "success": True,
                "has_data": True,
                "provider": self.name,
                "city": settings.GTFS_CITY_NAME,
                "route_number": route_upper,
                "nearest_stop": {
                    "stop_id": primary["stop_id"],
                    "name": primary["stop_name"],
                    "distance_m": round(primary["distance_km"] * 1000) if primary["distance_km"] is not None else None,
                    "latitude": primary["latitude"],
                    "longitude": primary["longitude"],
                },
                "arrivals": matching_arrivals[:5],
                "next_arrivals_minutes": same_stop_etas,
                "spoken_summary": (
                    f"Bus {route_upper} arrives at {primary['stop_name']} in "
                    f"{primary['eta_minutes']} minute{'s' if primary['eta_minutes'] != 1 else ''}, "
                    f"going toward {primary['direction']}."
                ),
            }

        if matching_vehicles:
            matching_vehicles.sort(key=lambda x: x["distance_km"] if x["distance_km"] is not None else 999.0)
            primary = matching_vehicles[0]
            eta_part = f"estimated {primary['eta_minutes']} minutes away, " if primary["eta_minutes"] else ""
            return {
                "success": True,
                "has_data": True,
                "provider": self.name,
                "city": settings.GTFS_CITY_NAME,
                "route_number": route_upper,
                "nearest_stop": {"name": primary["stop_name"]},
                "arrivals": matching_vehicles[:5],
                "next_arrivals_minutes": [primary["eta_minutes"]] if primary["eta_minutes"] else [],
                "spoken_summary": (
                    f"Bus {route_upper} ({primary['bus_number']}) is {eta_part}"
                    f"going toward {primary['direction']}."
                ),
            }

        # Scheduled GTFS static stop_times fallback if route exists in static GTFS
        if target_route_id and static["route_trips"].get(target_route_id):
            now_local = datetime.now().strftime("%H:%M:%S")
            scheduled = []
            for tid in static["route_trips"][target_route_id]:
                headsign = static["trips"][tid].get("headsign") or "Route Terminus"
                for st in static["stop_times_by_trip"].get(tid, []):
                    t_str = st["arrival_time"]
                    if not t_str:
                        continue
                    try:
                        hh, mm, _ = [int(x) for x in t_str.split(":")]
                        now_dt = datetime.now()
                        now_mins = now_dt.hour * 60 + now_dt.minute
                        dep_mins = hh * 60 + mm
                        diff = dep_mins - now_mins
                        if 0 <= diff <= 120:
                            stop_obj = static["stops"].get(st["stop_id"], {"name": st["stop_id"]})
                            dist_km = (
                                haversine_distance_km(lat, lng, stop_obj["latitude"], stop_obj["longitude"])
                                if (lat is not None and lng is not None and stop_obj.get("latitude") is not None)
                                else None
                            )
                            scheduled.append({
                                "route": route_upper,
                                "stop_id": st["stop_id"],
                                "stop_name": stop_obj.get("name") or "Transit Stop",
                                "direction": headsign,
                                "eta_minutes": max(1, diff),
                                "distance_km": round(dist_km, 3) if dist_km is not None else None,
                                "live": False,
                            })
                    except Exception:
                        continue
            if scheduled:
                scheduled.sort(key=lambda x: (x["distance_km"] if x["distance_km"] is not None else 999.0, x["eta_minutes"]))
                primary = scheduled[0]
                return {
                    "success": True,
                    "has_data": True,
                    "provider": self.name,
                    "city": settings.GTFS_CITY_NAME,
                    "route_number": route_upper,
                    "nearest_stop": {"name": primary["stop_name"]},
                    "arrivals": scheduled[:5],
                    "next_arrivals_minutes": [s["eta_minutes"] for s in scheduled[:3] if s["stop_name"] == primary["stop_name"]],
                    "spoken_summary": (
                        f"Bus {route_upper} arrives at {primary['stop_name']} in "
                        f"{primary['eta_minutes']} minute{'s' if primary['eta_minutes'] != 1 else ''}, "
                        f"going toward {primary['direction']} (scheduled)."
                    ),
                }

        return None


# ── Adapter 2: Existing BMTC Bengaluru Live Proxy Adapter ─────────────────────
class BMTCBusProvider(BusProvider):
    name = "bmtc"

    def is_configured(self) -> bool:
        return True

    async def lookup_route(
        self,
        route_number: str,
        lat: Optional[float],
        lng: Optional[float],
        city: Optional[str] = None,
    ) -> Optional[dict]:
        if city and city.strip().lower() not in ("bengaluru", "bangalore", "blr", "current", "local"):
            return None
        if lat is not None and lng is not None:
            dist_from_blr = haversine_distance_km(lat, lng, _BENGALURU_CENTER[0], _BENGALURU_CENTER[1])
            if dist_from_blr > 120.0:
                return None

        use_lat = lat if lat is not None else _BENGALURU_CENTER[0]
        use_lng = lng if lng is not None else _BENGALURU_CENTER[1]
        try:
            res = await asyncio.to_thread(bmtc_routes.nearby_bus, route_number, use_lat, use_lng)
        except Exception as exc:
            logger.debug("BMTC provider lookup skipped for %s: %s", route_number, exc)
            return None

        if not res or not res.get("success") or not res.get("nearest_bus"):
            return None

        nearest = res["nearest_bus"]
        dist_km = float(nearest.get("distance_km") or 0.5)
        eta_min = max(1, int(round((dist_km / 20.0) * 60)))
        stop_label = nearest.get("location") or "your nearest stop"
        return {
            "success": True,
            "has_data": True,
            "provider": self.name,
            "city": "Bengaluru",
            "route_number": route_number.upper(),
            "nearest_stop": {"name": stop_label},
            "arrivals": [
                {
                    "route": b.get("route", route_number.upper()),
                    "stop_name": b.get("location") or "Bengaluru BMTC Stop",
                    "direction": "approaching you" if b.get("approaching") else "moving along route",
                    "eta_minutes": max(1, int(round((float(b.get("distance_km") or 0.5) / 20.0) * 60))),
                    "distance_km": b.get("distance_km"),
                    "vehicle_id": b.get("vehicle_id"),
                    "bus_number": b.get("bus_number"),
                    "latitude": b.get("latitude"),
                    "longitude": b.get("longitude"),
                    "approaching": b.get("approaching"),
                    "live": True,
                }
                for b in res.get("all_buses", [nearest])[:5]
            ],
            "next_arrivals_minutes": [eta_min],
            "spoken_summary": res.get("message") or (
                f"Bus {route_number.upper()} is about {eta_min} minute{'s' if eta_min != 1 else ''} away."
            ),
        }


# ── Adapter 3: Local Mock / JSON Demo Adapter ─────────────────────────────────
class MockJsonBusProvider(BusProvider):
    name = "mock_json"

    def is_configured(self) -> bool:
        return bool(settings.BUS_MOCK_ENABLED)

    def _load_data(self) -> dict:
        custom = (settings.MOCK_BUS_DATA_PATH or "").strip()
        target = Path(custom) if custom else _DEFAULT_MOCK_PATH
        if not target.is_file():
            return {"demo_cities": [], "stops": [], "routes": {}}
        with open(target, "r", encoding="utf-8") as f:
            return json.load(f)

    async def nearest_stop(self, lat: float, lng: float) -> Optional[dict]:
        data = self._load_data()
        stops = data.get("stops", [])
        if not stops:
            return None
        best = None
        best_km = 1e9
        for st in stops:
            km = haversine_distance_km(lat, lng, st["latitude"], st["longitude"])
            if km < best_km:
                best_km = km
                best = {**st, "distance_m": round(km * 1000)}
        return best

    async def lookup_route(
        self,
        route_number: str,
        lat: Optional[float],
        lng: Optional[float],
        city: Optional[str] = None,
    ) -> Optional[dict]:
        if not self.is_configured():
            return None
        data = self._load_data()
        if city:
            allowed_cities = {c.lower() for c in data.get("demo_cities", ["bengaluru", "bangalore", "demo", "default"])}
            if city.strip().lower() not in allowed_cities:
                return None

        key = route_number.strip().upper()
        item = data.get("routes", {}).get(key)
        if not item:
            return None

        stop_name = item.get("stop_name", "Central Stop")
        direction = item.get("direction", "City Center")
        eta = int(item.get("eta_minutes", 6))
        etas = item.get("next_arrivals_minutes", [eta])
        return {
            "success": True,
            "has_data": True,
            "provider": self.name,
            "city": city or settings.GTFS_CITY_NAME or "Bengaluru",
            "route_number": key,
            "nearest_stop": {
                "stop_id": item.get("stop_id"),
                "name": stop_name,
                "latitude": item.get("latitude"),
                "longitude": item.get("longitude"),
            },
            "arrivals": [
                {
                    "route": key,
                    "stop_id": item.get("stop_id"),
                    "stop_name": stop_name,
                    "direction": direction,
                    "eta_minutes": eta,
                    "next_arrivals_minutes": etas,
                    "vehicle_id": item.get("vehicle_id"),
                    "bus_number": item.get("bus_number"),
                    "latitude": item.get("latitude"),
                    "longitude": item.get("longitude"),
                    "approaching": bool(item.get("approaching", True)),
                    "live": bool(item.get("live", True)),
                }
            ],
            "next_arrivals_minutes": etas,
            "spoken_summary": (
                f"Bus {key} arrives at {stop_name} in {eta} "
                f"minute{'s' if eta != 1 else ''}, going toward {direction}."
            ),
        }


# ── Adapter 4: Optional Paid API Slot (Disabled Placeholder) ──────────────────
class PaidTransitApiPlaceholderProvider(BusProvider):
    name = "paid_api_placeholder"

    def is_configured(self) -> bool:
        return False

    async def lookup_route(
        self,
        route_number: str,
        lat: Optional[float],
        lng: Optional[float],
        city: Optional[str] = None,
    ) -> Optional[dict]:
        return None


# ── Central Bus Service Orchestrator w/ Short TTL Cache ───────────────────────
class BusService:
    def __init__(self):
        self.gtfs = GTFSBusProvider()
        self.bmtc = BMTCBusProvider()
        self.mock = MockJsonBusProvider()
        self.paid = PaidTransitApiPlaceholderProvider()
        self._cache: dict[tuple, tuple[float, dict]] = {}

    def clear_cache(self):
        self._cache.clear()

    def get_provider_status(self) -> list[dict]:
        return [
            {"name": self.gtfs.name, "configured": self.gtfs.is_configured()},
            {"name": self.bmtc.name, "configured": self.bmtc.is_configured()},
            {"name": self.mock.name, "configured": self.mock.is_configured()},
            {"name": self.paid.name, "configured": self.paid.is_configured()},
        ]

    async def get_nearest_stop(self, lat: float, lng: float) -> Optional[dict]:
        if self.gtfs.is_configured():
            stop = await self.gtfs.nearest_stop(lat, lng)
            if stop:
                return stop
        if self.mock.is_configured():
            stop = await self.mock.nearest_stop(lat, lng)
            if stop:
                return stop
        return None

    async def get_bus_arrivals(
        self,
        route_number: str,
        *,
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        city: Optional[str] = None,
        provider_override: Optional[str] = None,
    ) -> dict:
        route_clean = (route_number or "").strip().upper()
        if not route_clean:
            return {
                "success": False,
                "has_data": False,
                "provider": "none",
                "route_number": "",
                "arrivals": [],
                "cached": False,
                "spoken_summary": "Please tell me a bus route number, for example bus 400.",
                "suggestion": "ask_route_number",
            }

        mode = (provider_override or settings.BUS_PROVIDER_MODE or "auto").strip().lower()
        city_clean = (city or "").strip() or settings.GTFS_CITY_NAME
        cache_key = (
            mode,
            city_clean.lower(),
            route_clean,
            round(float(lat), 3) if lat is not None else None,
            round(float(lng), 3) if lng is not None else None,
        )

        now_mono = time.monotonic()
        ttl = max(0, int(settings.BUS_CACHE_TTL_SECONDS))
        cached_entry = self._cache.get(cache_key)
        if ttl > 0 and cached_entry and (now_mono - cached_entry[0]) < ttl:
            return {**cached_entry[1], "cached": True}

        chain: list[BusProvider] = []
        if mode == "gtfs":
            chain = [self.gtfs]
        elif mode == "bmtc":
            chain = [self.bmtc]
        elif mode == "mock":
            chain = [self.mock]
        else:
            chain = [self.gtfs, self.bmtc, self.mock]

        for adapter in chain:
            if not adapter.is_configured():
                continue
            try:
                res = await adapter.lookup_route(route_clean, lat, lng, city=city)
            except Exception as exc:
                logger.warning("Bus provider %s failed for route %s: %s", adapter.name, route_clean, exc)
                res = None
            if res and res.get("has_data"):
                final_res = {**res, "cached": False}
                if ttl > 0:
                    self._cache[cache_key] = (time.monotonic(), final_res)
                return final_res

        nearest = await self.get_nearest_stop(lat, lng) if (lat is not None and lng is not None) else None
        stop_hint = (
            f" Your nearest known stop is {nearest['name']}."
            if nearest and nearest.get("name")
            else ""
        )
        no_data = {
            "success": False,
            "has_data": False,
            "provider": "none",
            "city": city_clean,
            "route_number": route_clean,
            "nearest_stop": nearest,
            "arrivals": [],
            "next_arrivals_minutes": [],
            "cached": False,
            "suggestion": "offer_volunteer_or_walk_to_stop",
            "spoken_summary": (
                f"I don't have live arrival data for bus {route_clean} in {city_clean} right now.{stop_hint} "
                "Would you like me to navigate to the nearest bus stop, or request volunteer assistance?"
            ),
        }
        return no_data


bus_service = BusService()

