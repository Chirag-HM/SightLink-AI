import json
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Header, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc

from ..database import get_db
from ..models import (
    User,
    ConnectedDevice,
    HealthConsent,
    HealthRecord,
    HealthDailySummary,
    HealthSyncHistory,
)
from ..schemas import (
    PairingCodeResponse,
    RegisterDeviceRequest,
    RegisterDeviceResponse,
    HealthRecordItem,
    HealthSyncBatchRequest,
    HealthSyncBatchResponse,
    HealthConsentItem,
    UpdateConsentsRequest,
    DailyHealthSummaryResponse,
    HealthTrendsResponse,
    ConnectedDeviceResponse,
    DeleteHealthDataResponse,
)
from ..auth import get_current_user

logger = logging.getLogger("health_connect_routes")

router = APIRouter(prefix="/api/health-connect", tags=["Health Connect Integration"])


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _get_device_from_auth(
    db: Session,
    x_device_token: Optional[str] = Header(None, alias="X-Device-Token"),
    token_in_body: Optional[str] = None,
) -> Optional[ConnectedDevice]:
    token = x_device_token or token_in_body
    if not token:
        return None
    device = db.query(ConnectedDevice).filter(
        ConnectedDevice.device_token == token,
        ConnectedDevice.is_active == True,
    ).first()
    return device


# ── 1. Device Pairing Code Generation (Web Dashboard) ─────────────────────────
@router.post("/devices/pair-code", response_model=PairingCodeResponse)
def generate_device_pairing_code(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generates a secure 6-digit numeric pairing code displayed in the web dashboard
    with a 10-minute expiry to link the Android companion app.
    """
    now = datetime.now(timezone.utc)
    # Generate 6-digit numeric code
    code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = now + timedelta(minutes=10)

    # Invalidate any previously expired or uncompleted pairing slots for this user
    existing_pending = db.query(ConnectedDevice).filter(
        ConnectedDevice.user_id == user.id,
        ConnectedDevice.device_token.like("pending_%"),
    ).all()
    for p in existing_pending:
        db.delete(p)

    # Create a pairing placeholder device
    pending_device = ConnectedDevice(
        user_id=user.id,
        device_name="Android Companion",
        device_token=f"pending_{secrets.token_hex(16)}",
        pairing_code=code,
        pairing_code_expires_at=expires_at,
        is_active=False,
    )
    db.add(pending_device)
    db.commit()

    return PairingCodeResponse(
        pairing_code=code,
        expires_at=expires_at,
        expires_in_seconds=600,
    )


# ── 2. Android Device Registration ───────────────────────────────────────────
@router.post("/devices/register", response_model=RegisterDeviceResponse)
def register_android_device(
    payload: RegisterDeviceRequest,
    db: Session = Depends(get_db),
):
    """
    Android Companion exchanges the user-entered 6-digit pairing code for
    a persistent, cryptographically secure device_token for background sync.
    """
    now = datetime.now(timezone.utc)
    clean_code = payload.pairing_code.strip()

    device = db.query(ConnectedDevice).filter(
        ConnectedDevice.pairing_code == clean_code,
    ).first()

    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid pairing code. Please generate a new code in your dashboard.",
        )

    exp = _as_utc(device.pairing_code_expires_at)
    if exp and now > exp:
        db.delete(device)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pairing code has expired. Please generate a new code in your dashboard.",
        )

    # Generate permanent device token
    permanent_token = secrets.token_hex(32)
    device.device_name = payload.device_name
    device.device_model = payload.device_model or "Android Device"
    device.os_version = payload.os_version or "Android"
    device.app_version = payload.app_version or "1.0.0"
    device.device_token = permanent_token
    device.pairing_code = None
    device.pairing_code_expires_at = None
    device.is_active = True
    device.updated_at = now

    db.commit()
    db.refresh(device)

    return RegisterDeviceResponse(
        device_id=device.id,
        device_token=permanent_token,
        device_name=device.device_name,
        user_id=device.user_id,
        message="Device successfully linked to SightLink AI.",
    )


# ── 3. Update Health Permissions Consent ──────────────────────────────────────
@router.post("/consents")
def update_health_consents(
    payload: UpdateConsentsRequest,
    x_device_token: Optional[str] = Header(None, alias="X-Device-Token"),
    db: Session = Depends(get_db),
):
    """
    Updates the list of granted/revoked Health Connect permissions from the Android app.
    """
    device = _get_device_from_auth(db, x_device_token, payload.device_token)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing device token.",
        )

    now = datetime.now(timezone.utc)
    for c in payload.consents:
        existing = db.query(HealthConsent).filter(
            HealthConsent.device_id == device.id,
            HealthConsent.permission_name == c.permission_name,
        ).first()

        if existing:
            existing.granted = c.granted
            existing.updated_at = now
        else:
            consent = HealthConsent(
                user_id=device.user_id,
                device_id=device.id,
                permission_name=c.permission_name,
                granted=c.granted,
                updated_at=now,
            )
            db.add(consent)

    db.commit()
    return {"status": "success", "message": "Permissions updated successfully."}


# ── 4. Batch Sync Health Records (Idempotent Deduplication) ───────────────────
@router.post("/records/sync", response_model=HealthSyncBatchResponse)
def sync_health_records(
    payload: HealthSyncBatchRequest,
    x_device_token: Optional[str] = Header(None, alias="X-Device-Token"),
    db: Session = Depends(get_db),
):
    """
    Idempotent batch upload of Health Connect records.
    Deduplicates on (user_id, client_record_id), updates daily aggregates,
    and logs sync audit history.
    """
    device = _get_device_from_auth(db, x_device_token, payload.device_token)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing device token for health synchronization.",
        )

    now = datetime.now(timezone.utc)
    records_received = len(payload.records)
    records_inserted = 0
    records_updated = 0
    affected_dates = set()

    try:
        for item in payload.records:
            # Check for existing record by unique client_record_id
            existing = db.query(HealthRecord).filter(
                HealthRecord.user_id == device.user_id,
                HealthRecord.client_record_id == item.client_record_id,
            ).first()

            rec_date_str = None
            if item.start_time:
                rec_date_str = item.start_time.strftime("%Y-%m-%d")
            elif item.end_time:
                rec_date_str = item.end_time.strftime("%Y-%m-%d")
            else:
                rec_date_str = now.strftime("%Y-%m-%d")

            affected_dates.add(rec_date_str)

            if existing:
                # Update if values changed
                changed = False
                if item.value_num is not None and existing.value_num != item.value_num:
                    existing.value_num = item.value_num
                    changed = True
                if item.secondary_value_num is not None and existing.secondary_value_num != item.secondary_value_num:
                    existing.secondary_value_num = item.secondary_value_num
                    changed = True
                if item.metadata_json is not None:
                    existing.metadata_json = item.metadata_json
                    changed = True
                if changed:
                    records_updated += 1
            else:
                # Insert new atomic record
                new_rec = HealthRecord(
                    user_id=device.user_id,
                    device_id=device.id,
                    record_type=item.record_type,
                    client_record_id=item.client_record_id,
                    start_time=item.start_time,
                    end_time=item.end_time,
                    value_num=item.value_num,
                    secondary_value_num=item.secondary_value_num,
                    unit=item.unit,
                    data_source=item.data_source,
                    metadata_json=item.metadata_json,
                    synced_at=now,
                )
                db.add(new_rec)
                records_inserted += 1

        db.commit()

        # Update Daily Aggregations for affected dates
        for d_str in affected_dates:
            _recompute_daily_summary(db, device.user_id, d_str)

        device.last_synced_at = now
        db.commit()

        # Audit sync log
        sync_log = HealthSyncHistory(
            user_id=device.user_id,
            device_id=device.id,
            synced_at=now,
            records_received=records_received,
            records_inserted=records_inserted,
            status="success",
        )
        db.add(sync_log)
        db.commit()

        return HealthSyncBatchResponse(
            status="success",
            records_received=records_received,
            records_inserted=records_inserted,
            records_updated=records_updated,
            synced_at=now,
        )

    except Exception as exc:
        db.rollback()
        logger.error(f"Health record sync error: {exc}", exc_info=True)
        sync_log = HealthSyncHistory(
            user_id=device.user_id,
            device_id=device.id,
            synced_at=now,
            records_received=records_received,
            records_inserted=0,
            status="failed",
            error_detail=str(exc),
        )
        db.add(sync_log)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to synchronize health records: {exc}",
        )


def _recompute_daily_summary(db: Session, user_id: str, date_str: str) -> None:
    """
    Recomputes daily rollup for the given date.
    Preserves None for metrics without data (never assumes missing is 0).
    """
    try:
        d_start = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        d_end = d_start + timedelta(days=1)
    except Exception:
        return

    # Fetch all records for this user that fall on this day
    records = db.query(HealthRecord).filter(
        HealthRecord.user_id == user_id,
        func.coalesce(HealthRecord.start_time, HealthRecord.end_time) >= d_start,
        func.coalesce(HealthRecord.start_time, HealthRecord.end_time) < d_end,
    ).all()

    steps_total = None
    active_cal_total = None
    total_cal_total = None
    dist_total = None
    hr_values = []
    resting_hr_values = []
    sleep_minutes_total = None
    sleep_stages_dict = {}
    spo2_values = []
    systolic_values = []
    diastolic_values = []
    exercise_minutes = None

    for r in records:
        rtype = r.record_type.lower()
        val = r.value_num

        if rtype == "steps" and val is not None:
            steps_total = (steps_total or 0) + int(val)
        elif rtype == "active_calories" and val is not None:
            active_cal_total = (active_cal_total or 0.0) + float(val)
        elif rtype == "total_calories" and val is not None:
            total_cal_total = (total_cal_total or 0.0) + float(val)
        elif rtype == "distance" and val is not None:
            dist_total = (dist_total or 0.0) + float(val)
        elif rtype == "heart_rate" and val is not None and val > 0:
            hr_values.append(val)
        elif rtype == "resting_heart_rate" and val is not None and val > 0:
            resting_hr_values.append(val)
        elif rtype == "sleep_session":
            # Sleep duration in minutes
            if r.start_time and r.end_time:
                mins = int((r.end_time - r.start_time).total_seconds() / 60.0)
                if mins > 0:
                    sleep_minutes_total = (sleep_minutes_total or 0) + mins
            elif val is not None:
                sleep_minutes_total = (sleep_minutes_total or 0) + int(val)

            # Parse stages if present in metadata
            if r.metadata_json:
                try:
                    meta = json.loads(r.metadata_json)
                    if isinstance(meta, dict) and "stages" in meta:
                        for k, v in meta["stages"].items():
                            sleep_stages_dict[k] = sleep_stages_dict.get(k, 0) + int(v)
                except Exception:
                    pass
        elif rtype in ("spo2", "blood_oxygen") and val is not None and val > 0:
            spo2_values.append(val)
        elif rtype == "blood_pressure":
            if val is not None and val > 0:
                systolic_values.append(val)
            if r.secondary_value_num is not None and r.secondary_value_num > 0:
                diastolic_values.append(r.secondary_value_num)
        elif rtype == "exercise" or rtype == "exercise_session":
            if r.start_time and r.end_time:
                mins = int((r.end_time - r.start_time).total_seconds() / 60.0)
                if mins > 0:
                    exercise_minutes = (exercise_minutes or 0) + mins
            elif val is not None:
                exercise_minutes = (exercise_minutes or 0) + int(val)

    avg_hr = round(sum(hr_values) / len(hr_values), 1) if hr_values else None
    min_hr = min(hr_values) if hr_values else None
    max_hr = max(hr_values) if hr_values else None
    resting_hr = round(sum(resting_hr_values) / len(resting_hr_values), 1) if resting_hr_values else None
    spo2_avg = round(sum(spo2_values) / len(spo2_values), 1) if spo2_values else None
    sys_avg = round(sum(systolic_values) / len(systolic_values), 1) if systolic_values else None
    dia_avg = round(sum(diastolic_values) / len(diastolic_values), 1) if diastolic_values else None
    stages_json = json.dumps(sleep_stages_dict) if sleep_stages_dict else None

    # Upsert into HealthDailySummary
    summary = db.query(HealthDailySummary).filter(
        HealthDailySummary.user_id == user_id,
        HealthDailySummary.date == date_str,
    ).first()

    now = datetime.now(timezone.utc)
    if summary:
        summary.steps = steps_total
        summary.active_calories = round(active_cal_total, 1) if active_cal_total is not None else None
        summary.total_calories = round(total_cal_total, 1) if total_cal_total is not None else None
        summary.distance_meters = round(dist_total, 1) if dist_total is not None else None
        summary.avg_heart_rate = avg_hr
        summary.min_heart_rate = min_hr
        summary.max_heart_rate = max_hr
        summary.resting_heart_rate = resting_hr
        summary.sleep_duration_minutes = sleep_minutes_total
        summary.sleep_stages_json = stages_json
        summary.spo2_avg = spo2_avg
        summary.systolic_avg = sys_avg
        summary.diastolic_avg = dia_avg
        summary.exercise_duration_minutes = exercise_minutes
        summary.last_synced_at = now
    else:
        new_summary = HealthDailySummary(
            user_id=user_id,
            date=date_str,
            steps=steps_total,
            active_calories=round(active_cal_total, 1) if active_cal_total is not None else None,
            total_calories=round(total_cal_total, 1) if total_cal_total is not None else None,
            distance_meters=round(dist_total, 1) if dist_total is not None else None,
            avg_heart_rate=avg_hr,
            min_heart_rate=min_hr,
            max_heart_rate=max_hr,
            resting_heart_rate=resting_hr,
            sleep_duration_minutes=sleep_minutes_total,
            sleep_stages_json=stages_json,
            spo2_avg=spo2_avg,
            systolic_avg=sys_avg,
            diastolic_avg=dia_avg,
            exercise_duration_minutes=exercise_minutes,
            last_synced_at=now,
        )
        db.add(new_summary)


# ── 5. Fetch Daily Health Summary ─────────────────────────────────────────────
@router.get("/dashboard/summary")
def get_daily_health_summary(
    date: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns today's (or requested date's) metrics for the user dashboard.
    Distinguishes null (unavailable) from 0.
    """
    now = datetime.now(timezone.utc)
    target_date = date or now.strftime("%Y-%m-%d")

    summary = db.query(HealthDailySummary).filter(
        HealthDailySummary.user_id == user.id,
        HealthDailySummary.date == target_date,
    ).first()

    # Get yesterday for delta comparison
    try:
        t_dt = datetime.strptime(target_date, "%Y-%m-%d")
        y_date = (t_dt - timedelta(days=1)).strftime("%Y-%m-%d")
    except Exception:
        y_date = None

    yesterday_summary = None
    if y_date:
        yesterday_summary = db.query(HealthDailySummary).filter(
            HealthDailySummary.user_id == user.id,
            HealthDailySummary.date == y_date,
        ).first()

    # Get active device info
    active_device = db.query(ConnectedDevice).filter(
        ConnectedDevice.user_id == user.id,
        ConnectedDevice.is_active == True,
    ).order_by(desc(ConnectedDevice.last_synced_at)).first()

    sleep_stages = None
    if summary and summary.sleep_stages_json:
        try:
            sleep_stages = json.loads(summary.sleep_stages_json)
        except Exception:
            pass

    return {
        "date": target_date,
        "is_today": target_date == now.strftime("%Y-%m-%d"),
        "connected_device": {
            "id": active_device.id,
            "device_name": active_device.device_name,
            "device_model": active_device.device_model,
            "last_synced_at": active_device.last_synced_at,
        } if active_device else None,
        "metrics": {
            "steps": summary.steps if summary else None,
            "active_calories": summary.active_calories if summary else None,
            "total_calories": summary.total_calories if summary else None,
            "distance_meters": summary.distance_meters if summary else None,
            "avg_heart_rate": summary.avg_heart_rate if summary else None,
            "min_heart_rate": summary.min_heart_rate if summary else None,
            "max_heart_rate": summary.max_heart_rate if summary else None,
            "resting_heart_rate": summary.resting_heart_rate if summary else None,
            "sleep_duration_minutes": summary.sleep_duration_minutes if summary else None,
            "sleep_stages": sleep_stages,
            "spo2_avg": summary.spo2_avg if summary else None,
            "systolic_avg": summary.systolic_avg if summary else None,
            "diastolic_avg": summary.diastolic_avg if summary else None,
            "exercise_duration_minutes": summary.exercise_duration_minutes if summary else None,
        },
        "yesterday_metrics": {
            "steps": yesterday_summary.steps if yesterday_summary else None,
            "distance_meters": yesterday_summary.distance_meters if yesterday_summary else None,
            "active_calories": yesterday_summary.active_calories if yesterday_summary else None,
            "avg_heart_rate": yesterday_summary.avg_heart_rate if yesterday_summary else None,
        } if yesterday_summary else None,
        "last_synced_at": summary.last_synced_at if summary else (active_device.last_synced_at if active_device else None),
    }


# ── 6. Fetch Historical Health Trends (Daily / Weekly / Monthly) ──────────────
@router.get("/dashboard/trends", response_model=HealthTrendsResponse)
def get_health_trends(
    period: str = Query("weekly", pattern="^(daily|weekly|monthly)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns time-series aggregations for health trend charts:
    - weekly: past 7 days
    - monthly: past 30 days
    - daily: past 24 hours / hourly steps and HR if available, falling back to 7 days
    """
    now = datetime.now(timezone.utc)
    num_days = 7 if period == "weekly" else (30 if period == "monthly" else 7)

    date_list = [
        (now - timedelta(days=i)).strftime("%Y-%m-%d")
        for i in reversed(range(num_days))
    ]

    summaries = db.query(HealthDailySummary).filter(
        HealthDailySummary.user_id == user.id,
        HealthDailySummary.date.in_(date_list),
    ).all()
    summary_map = {s.date: s for s in summaries}

    data_points = []
    valid_steps = []
    valid_hr = []
    valid_sleep = []
    valid_dist = []
    valid_cal = []

    for d in date_list:
        s = summary_map.get(d)
        stages = None
        if s and s.sleep_stages_json:
            try:
                stages = json.loads(s.sleep_stages_json)
            except Exception:
                pass

        if s:
            if s.steps is not None:
                valid_steps.append(s.steps)
            if s.avg_heart_rate is not None:
                valid_hr.append(s.avg_heart_rate)
            if s.sleep_duration_minutes is not None:
                valid_sleep.append(s.sleep_duration_minutes)
            if s.distance_meters is not None:
                valid_dist.append(s.distance_meters)
            if s.active_calories is not None:
                valid_cal.append(s.active_calories)

        data_points.append(
            DailyHealthSummaryResponse(
                date=d,
                steps=s.steps if s else None,
                active_calories=s.active_calories if s else None,
                total_calories=s.total_calories if s else None,
                distance_meters=s.distance_meters if s else None,
                avg_heart_rate=s.avg_heart_rate if s else None,
                min_heart_rate=s.min_heart_rate if s else None,
                max_heart_rate=s.max_heart_rate if s else None,
                resting_heart_rate=s.resting_heart_rate if s else None,
                sleep_duration_minutes=s.sleep_duration_minutes if s else None,
                sleep_stages=stages,
                spo2_avg=s.spo2_avg if s else None,
                systolic_avg=s.systolic_avg if s else None,
                diastolic_avg=s.diastolic_avg if s else None,
                exercise_duration_minutes=s.exercise_duration_minutes if s else None,
                last_synced_at=s.last_synced_at if s else None,
            )
        )

    summary_averages = {
        "avg_daily_steps": int(sum(valid_steps) / len(valid_steps)) if valid_steps else None,
        "avg_heart_rate": round(sum(valid_hr) / len(valid_hr), 1) if valid_hr else None,
        "avg_sleep_minutes": int(sum(valid_sleep) / len(valid_sleep)) if valid_sleep else None,
        "avg_distance_meters": round(sum(valid_dist) / len(valid_dist), 1) if valid_dist else None,
        "avg_active_calories": round(sum(valid_cal) / len(valid_cal), 1) if valid_cal else None,
        "days_with_data": len([s for s in data_points if s.steps is not None or s.avg_heart_rate is not None]),
    }

    return HealthTrendsResponse(
        period=period,
        data_points=data_points,
        summary_averages=summary_averages,
    )


# ── 7. Fetch Raw Health Records (Paginated) ───────────────────────────────────
@router.get("/records")
def get_raw_health_records(
    record_type: Optional[str] = None,
    date: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Paginated query for raw health records with optional record_type or date filtering.
    """
    query = db.query(HealthRecord).filter(HealthRecord.user_id == user.id)

    if record_type:
        query = query.filter(HealthRecord.record_type == record_type)

    if date:
        try:
            d_start = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            d_end = d_start + timedelta(days=1)
            query = query.filter(
                func.coalesce(HealthRecord.start_time, HealthRecord.end_time) >= d_start,
                func.coalesce(HealthRecord.start_time, HealthRecord.end_time) < d_end,
            )
        except Exception:
            pass

    total = query.count()
    records = query.order_by(desc(HealthRecord.synced_at)).offset(offset).limit(limit).all()

    items = []
    for r in records:
        items.append({
            "id": r.id,
            "record_type": r.record_type,
            "client_record_id": r.client_record_id,
            "start_time": r.start_time,
            "end_time": r.end_time,
            "value_num": r.value_num,
            "secondary_value_num": r.secondary_value_num,
            "unit": r.unit,
            "data_source": r.data_source,
            "synced_at": r.synced_at,
        })

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "records": items,
    }


# ── 8. List Connected Devices ─────────────────────────────────────────────────
@router.get("/devices", response_model=List[ConnectedDeviceResponse])
def list_connected_devices(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lists all connected Android companion devices for the authenticated user.
    """
    devices = db.query(ConnectedDevice).filter(
        ConnectedDevice.user_id == user.id,
        ConnectedDevice.is_active == True,
    ).order_by(desc(ConnectedDevice.last_synced_at)).all()

    result = []
    for d in devices:
        consents = db.query(HealthConsent).filter(HealthConsent.device_id == d.id).all()
        consent_items = [
            HealthConsentItem(permission_name=c.permission_name, granted=c.granted)
            for c in consents
        ]
        result.append(
            ConnectedDeviceResponse(
                id=d.id,
                device_name=d.device_name,
                device_model=d.device_model,
                os_version=d.os_version,
                app_version=d.app_version,
                is_active=d.is_active,
                last_synced_at=d.last_synced_at,
                created_at=d.created_at,
                consents=consent_items,
            )
        )
    return result


# ── 9. Remove/Revoke Device Connection ────────────────────────────────────────
@router.delete("/devices/{device_id}")
def unlink_device(
    device_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Revokes authorization for a connected Android companion device.
    """
    device = db.query(ConnectedDevice).filter(
        ConnectedDevice.id == device_id,
        ConnectedDevice.user_id == user.id,
    ).first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found.")

    device.is_active = False
    device.device_token = f"revoked_{secrets.token_hex(16)}"
    db.commit()

    return {"status": "success", "message": f"Device '{device.device_name}' has been disconnected."}


# ── 10. GDPR Privacy Purge (Delete User Health Records) ───────────────────────
@router.delete("/records", response_model=DeleteHealthDataResponse)
def purge_all_health_records(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Permanently erases all raw health records and summaries for the authenticated user.
    """
    recs_count = db.query(HealthRecord).filter(HealthRecord.user_id == user.id).delete(synchronize_session=False)
    db.query(HealthDailySummary).filter(HealthDailySummary.user_id == user.id).delete(synchronize_session=False)
    db.query(HealthSyncHistory).filter(HealthSyncHistory.user_id == user.id).delete(synchronize_session=False)
    db.commit()

    return DeleteHealthDataResponse(
        status="success",
        deleted_records_count=recs_count,
        message="All your health records and daily summaries have been permanently deleted.",
    )


# ── 11. Quick Sync & Health Connection Status ─────────────────────────────────
@router.get("/status")
def get_health_connection_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Quick status endpoint for badges in navbar or overview card.
    """
    device_count = db.query(ConnectedDevice).filter(
        ConnectedDevice.user_id == user.id,
        ConnectedDevice.is_active == True,
    ).count()

    latest_device = db.query(ConnectedDevice).filter(
        ConnectedDevice.user_id == user.id,
        ConnectedDevice.is_active == True,
    ).order_by(desc(ConnectedDevice.last_synced_at)).first()

    records_count = db.query(HealthRecord).filter(
        HealthRecord.user_id == user.id,
    ).count()

    return {
        "has_connected_device": device_count > 0,
        "device_count": device_count,
        "latest_device_name": latest_device.device_name if latest_device else None,
        "last_synced_at": latest_device.last_synced_at if latest_device else None,
        "total_records_stored": records_count,
    }

