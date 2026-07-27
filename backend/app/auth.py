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


def create_token(user: "models.User") -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "name": user.full_name,
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
    user = db.get(models.User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or inactive")
    return user


def require_admin(user: "models.User" = Depends(get_current_user)) -> "models.User":
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user


def user_public(u: "models.User") -> dict:
    parts = (u.full_name or "").split()
    initials = "".join(p[0] for p in parts[:2]).upper() or "?"
    return {
        "id": u.id, "role": u.role, "name": u.full_name, "rank": u.rank,
        "crewId": u.crew_id, "email": u.email, "ppNo": u.pp_no, "initials": initials,
    }


# --- very small in-memory login rate limiter (per identifier) ---
_attempts: dict[str, list] = {}
_MAX_ATTEMPTS = 6
_WINDOW_SECONDS = 300


def check_rate_limit(identifier: str, max_attempts: int = _MAX_ATTEMPTS,
                     window_seconds: int = _WINDOW_SECONDS):
    now = time.time()
    hits = [t for t in _attempts.get(identifier, []) if now - t < window_seconds]
    if len(hits) >= max_attempts:
        raise HTTPException(429, "Too many requests. Try again shortly.")
    hits.append(now)
    _attempts[identifier] = hits


def clear_rate_limit(identifier: str):
    _attempts.pop(identifier, None)
