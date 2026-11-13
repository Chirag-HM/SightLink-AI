import asyncio
from datetime import datetime, timezone
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from .models import AssistanceRequest, RequestStatus, LiveAssistSession, LiveAssistStatus, User

# Process-wide asyncio lock to serialize concurrent claims
claim_lock = asyncio.Lock()

async def atomic_claim_request(
    db: Session,
    request_id: str,
    volunteer: User
) -> AssistanceRequest:
    """
    Atomically claim an assistance request so that if multiple volunteers
    attempt to accept at the exact same moment, only ONE succeeds.
    All others receive a 409 Conflict status.
    """
    async with claim_lock:
        req = db.query(AssistanceRequest).filter(AssistanceRequest.id == request_id).first()
        if not req:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assistance request not found"
            )

        if req.status != RequestStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This request has already been {req.status.value.lower()} by another volunteer."
            )

        # Claim the request atomically
        req.status = RequestStatus.ACCEPTED
        req.accepted_by_id = volunteer.id
        req.accepted_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(req)
        return req


async def atomic_claim_live_assist(
    db: Session,
    session_id: str,
    volunteer: User,
) -> LiveAssistSession:
    """
    Atomically claim a Live Assist ("Eyes on Demand") session so only ONE
    verified volunteer joins; everyone else receives HTTP 409 "Already taken".
    """
    v_prof = volunteer.volunteer_profile
    is_verified = bool(volunteer.is_verified or (v_prof and v_prof.is_verified))
    if not is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verified volunteer status is required to join Eyes on Demand sessions.",
        )

    async with claim_lock:
        sess = db.query(LiveAssistSession).filter(LiveAssistSession.id == session_id).first()
        if not sess:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Live assist session not found",
            )

        if sess.status != LiveAssistStatus.WAITING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Already taken by another volunteer.",
            )

        now = datetime.now(timezone.utc)
        from datetime import timedelta
        sess.status = LiveAssistStatus.CONNECTED
        sess.accepted_by_id = volunteer.id
        sess.accepted_at = now
        sess.connected_at = now
        sess.expires_at = now + timedelta(seconds=sess.duration_sec or 30)
        db.commit()
        db.refresh(sess)
        return sess
