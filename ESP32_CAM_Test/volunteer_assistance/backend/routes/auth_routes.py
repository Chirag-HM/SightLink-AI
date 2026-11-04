from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, UserRole, VolunteerProfile
from ..schemas import UserRegisterRequest, UserLoginRequest, TokenResponse, UserProfileResponse
from ..auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(req: UserRegisterRequest, db: Session = Depends(get_db)):
    # Check if username or email is already taken
    existing_user = db.query(User).filter(
        (User.username == req.username) | 
        (User.email == req.email if req.email else False)
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email is already registered."
        )

    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
        phone_number=req.phone_number,
        role=req.role
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # If volunteer, create initial profile
    if req.role == UserRole.VOLUNTEER:
        profile = VolunteerProfile(
            user_id=user.id,
            is_available=False,
            share_location_consent=True
        )
        db.add(profile)
        db.commit()

    token = create_access_token(data={"sub": user.id, "role": user.role.value})
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        role=user.role,
        full_name=user.full_name
    )

@router.post("/login", response_model=TokenResponse)
def login(req: UserLoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password."
        )

    token = create_access_token(data={"sub": user.id, "role": user.role.value})
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        role=user.role,
        full_name=user.full_name
    )

@router.get("/me", response_model=UserProfileResponse)
def get_profile(current_user: User = Depends(get_current_user)):
    is_available = None
    if current_user.role == UserRole.VOLUNTEER and current_user.volunteer_profile:
        is_available = current_user.volunteer_profile.is_available

    return UserProfileResponse(
        id=current_user.id,
        username=current_user.username,
        full_name=current_user.full_name,
        email=current_user.email,
        phone_number=current_user.phone_number,
        role=current_user.role,
        is_available=is_available
    )
