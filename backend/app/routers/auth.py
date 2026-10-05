"""Authentication and session management router."""
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, orientation_ranks
from app.auth import (
    create_token, user_public, verify_password,
    parse_ddmmyyyy, normalize_name,
    check_rate_limit, clear_rate_limit,
    bearer, SECRET_KEY, ALGORITHM,
    candidate_public,
)

router = APIRouter(tags=["Auth"])


class LoginRequest(BaseModel):
    mode: str                       # 'crew' | 'admin' | 'office_staff'
    name: str | None = None         # crew login: full name
    dob: str | None = None          # 8 digits DDMMYYYY
    crewId: str | None = None       # crew login: tiebreaker only (name+DOB collision)
    email: str | None = None
    password: str | None = None


@router.post("/api/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    if req.mode == "crew":
        name = (req.name or "").strip()
        dob_raw = (req.dob or "").strip()
        check_rate_limit(db, f"crew:{normalize_name(name)}:{dob_raw}")
        dob = parse_ddmmyyyy(dob_raw)
        if not name or dob is None:
            raise HTTPException(401, "Invalid name or date of birth")
        candidates = db.query(models.User).filter_by(role="learner", date_of_birth=dob).all()
        target = normalize_name(name)
        matches = [u for u in candidates if normalize_name(u.full_name) == target]
        if not matches:
            raise HTTPException(401, "Invalid name or date of birth")
        if len(matches) > 1:
            crew_id = (req.crewId or "").strip()
            if not crew_id:
                raise HTTPException(
                    409, "More than one crew member matches that name and date of birth. "
                         "Please enter your Crew ID to continue.")
            matches = [u for u in matches if u.crew_id == crew_id]
            if len(matches) != 1:
                raise HTTPException(401, "Invalid Crew ID for that name and date of birth")
        user = matches[0]
        clear_rate_limit(db, f"crew:{normalize_name(name)}:{dob_raw}")

    elif req.mode == "admin":
        email = (req.email or "").strip().lower()
        check_rate_limit(db, f"admin:{email}")
        user = (db.query(models.User)
                .filter(models.User.email == email, models.User.role.in_(["admin", "super_admin"]))
                .first())
        if not user or not user.password_hash or not verify_password(req.password or "", user.password_hash):
            raise HTTPException(401, "Invalid email or password")
        clear_rate_limit(db, f"admin:{email}")
    elif req.mode == "office_staff":
        name = (req.name or "").strip()
        dob_raw = (req.dob or "").strip()
        check_rate_limit(db, f"office_staff:{normalize_name(name)}:{dob_raw}")
        dob = parse_ddmmyyyy(dob_raw)
        if not name or dob is None:
            raise HTTPException(401, "Invalid name or date of birth")
        candidates = db.query(models.User).filter_by(role="learner", date_of_birth=dob).all()
        target = normalize_name(name)
        matches = [u for u in candidates if normalize_name(u.full_name) == target and (u.rank or "").strip().upper() == "OFFICE STAFF"]
        if not matches:
            raise HTTPException(401, "Invalid name or date of birth")
        if len(matches) > 1:
            crew_id = (req.crewId or "").strip()
            if not crew_id:
                raise HTTPException(
                    409, "More than one office staff member matches that name and date of birth. "
                         "Please enter your Crew ID to continue.")
            matches = [u for u in matches if u.crew_id == crew_id]
            if len(matches) != 1:
                raise HTTPException(401, "Invalid Crew ID for that name and date of birth")
        user = matches[0]
        clear_rate_limit(db, f"office_staff:{normalize_name(name)}:{dob_raw}")
    else:
        raise HTTPException(400, "Invalid login mode")

    if not user.is_active:
        raise HTTPException(403, "This account is disabled")
    return {"token": create_token(user), "user": user_public(user)}


@router.get("/api/auth/crew-search")
def crew_search(q: str, request: Request, scope: str | None = None, db: Session = Depends(get_db)):
    """Public (pre-login) name autocomplete for the crew sign-in form."""
    check_rate_limit(db, f"crew-search:{request.client.host if request.client else 'unknown'}",
                     max_attempts=40, window_seconds=60)
    query = normalize_name(q)
    if len(query) < 1:
        return []
    candidates = (db.query(models.User)
                  .filter_by(role="learner", is_active=True).all())
    matches = [u for u in candidates if query in normalize_name(u.full_name)]
    if scope == "office_staff":
        matches = [u for u in matches if (u.rank or "").strip().upper() == "OFFICE STAFF"]
    elif scope == "orientation":
        enrolled_ids = {e.learner_id for e in db.query(models.OrientationEnrollment.learner_id).all()}
        matches = [u for u in matches if u.id in enrolled_ids
                  or (orientation_ranks.is_eligible_crew(u.rank) and (u.emp_status or "").strip().upper() == "SAIL")]
    else:
        # Standard crew search: exclude office staff
        matches = [u for u in matches if (u.rank or "").strip().upper() != "OFFICE STAFF"]
    
    matches.sort(key=lambda u: (not normalize_name(u.full_name).startswith(query), u.full_name))
    return [{"name": u.full_name, "rank": u.rank} for u in matches[:8]]


@router.get("/api/auth/me")
def me(
    creds = Depends(bearer),
    db: Session = Depends(get_db),
):
    """Universal /me endpoint — handles session tokens (crew/admin) and
    test_session tokens (screening test candidates)."""
    if creds is None:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired — please sign in again")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid authentication token")

    token_type = payload.get("type", "session")
    if token_type == "session":
        user = db.get(models.User, str(payload["sub"]))
        if not user or not user.is_active:
            raise HTTPException(401, "User not found or inactive")
        return user_public(user)
    elif token_type == "test_session":
        candidate = db.get(models.ScreeningCandidate, str(payload["sub"]))
        if not candidate or not candidate.is_active:
            raise HTTPException(401, "Candidate not found or inactive")
        return candidate_public(candidate)
    else:
        raise HTTPException(401, "Invalid token type")
