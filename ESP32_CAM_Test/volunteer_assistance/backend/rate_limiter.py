from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from .models import RateLimitEntry


def extract_client_ip(request: Request | None) -> str:
    if request is None:
        return "local"
    xff = request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip")
    if xff:
        return xff.split(",")[0].strip()[:64] or "local"
    if request.client and request.client.host:
        return str(request.client.host)[:64]
    return "local"


def _as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def count_hits(db: Session, bucket_key: str, window_seconds: int, now: datetime | None = None) -> tuple[int, int]:
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=window_seconds)
    rows = (
        db.query(RateLimitEntry)
        .filter(
            RateLimitEntry.bucket_key == bucket_key,
            RateLimitEntry.created_at >= cutoff,
        )
        .order_by(RateLimitEntry.created_at.asc())
        .all()
    )
    if not rows:
        return 0, 0
    oldest = _as_utc(rows[0].created_at)
    retry_after = max(1, int((oldest + timedelta(seconds=window_seconds) - now).total_seconds()))
    return len(rows), retry_after


def record_hit(db: Session, bucket_key: str, now: datetime | None = None) -> None:
    now = now or datetime.now(timezone.utc)
    db.add(RateLimitEntry(bucket_key=bucket_key, created_at=now))
    db.commit()


def enforce_rate_limit(
    db: Session,
    bucket_key: str,
    *,
    max_hits: int,
    window_seconds: int,
    detail: str,
    record: bool = True,
) -> int:
    now = datetime.now(timezone.utc)
    current_hits, retry_after = count_hits(db, bucket_key, window_seconds, now=now)
    if current_hits >= max_hits:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers={"Retry-After": str(retry_after)},
        )
    if record:
        record_hit(db, bucket_key, now=now)
        return current_hits + 1
    return current_hits


def prune_old_rate_limits(db: Session, older_than_hours: int = 48) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=older_than_hours)
    deleted = (
        db.query(RateLimitEntry)
        .filter(RateLimitEntry.created_at < cutoff)
        .delete(synchronize_session=False)
    )
    if deleted:
        db.commit()
    return deleted or 0

