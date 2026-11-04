import asyncio
from datetime import datetime, timezone
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from .models import AssistanceRequest, RequestStatus, User

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
