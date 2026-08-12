"""Authentication: bcrypt password hashing (admins), JWT issue/verify,
and FastAPI dependencies for the current user / admin-only routes.

Crew log in with crew_id + date of birth (8 digits DDMMYYYY).
Admins log in with email + password.
"""
import os
import time
from datetime import datetime, timedelta, timezone, date

import jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from .database import get_db
from . import models

SECRET_KEY = os.getenv("SECRET_KEY", "dev-insecure-change-me-in-production")
ALGORITHM = "HS256"
TOKEN_TTL_HOURS = 12

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)


def hash_password(raw: str) -> str:
    return pwd_context.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(raw, hashed)
    except Exception:
        return False


def normalize_name(s: str) -> str:
    """Case-insensitive, whitespace-collapsed form for matching crew names,
    so 'rajan   kumar' and 'Rajan Kumar' compare equal."""
    return " ".join((s or "").split()).casefold()


def parse_ddmmyyyy(s: str):
    """'25032004' -> date(2004, 3, 25); returns None if malformed."""
    if not s or not s.isdigit() or len(s) != 8:
        return None
    try:
        return date(int(s[4:8]), int(s[2:4]), int(s[0:2]))
    except ValueError:
        return None


def create_token(user: "models.User", token_type: str = "session") -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "name": user.full_name,
        "type": token_type,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> "models.User":
    if creds is None:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired — please sign in again")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid authentication token")
        
    if payload.get("type", "session") != "session":
        raise HTTPException(401, "Invalid token type")
        
    user = db.get(models.User, str(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or inactive")
    return user


def require_admin(user: "models.User" = Depends(get_current_user)) -> "models.User":
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user


UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "uploads"))

def user_public(u: "models.User") -> dict:
    parts = (u.full_name or "").split()
    initials = "".join(p[0] for p in parts[:2]).upper() or "?"
    photo_path = os.path.join(UPLOAD_DIR, "photos", f"{u.id}.jpg")
    return {
        "id": u.id, "role": u.role, "name": u.full_name, "rank": u.rank,
        "crewId": u.crew_id, "email": u.email, "ppNo": u.pp_no, "initials": initials,
        "hasPhoto": os.path.exists(photo_path),
    }


# --- Database-backed login rate limiter (per identifier) ---
_MAX_ATTEMPTS = 6
_WINDOW_SECONDS = 300

def check_rate_limit(db: Session, identifier: str, max_attempts: int = _MAX_ATTEMPTS,
                     window_seconds: int = _WINDOW_SECONDS):
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
    
    # Purge stale keys probabilistically or just ignore them. 
    # For performance, we just count recent ones here.
    hits = db.query(models.RateLimit).filter(
        models.RateLimit.identifier == identifier,
        models.RateLimit.timestamp >= cutoff
    ).count()
    
    if hits >= max_attempts:
        raise HTTPException(429, "Too many requests. Try again shortly.")
        
    db.add(models.RateLimit(identifier=identifier))
    db.commit()


def clear_rate_limit(db: Session, identifier: str):
    db.query(models.RateLimit).filter(models.RateLimit.identifier == identifier).delete()
    db.commit()
