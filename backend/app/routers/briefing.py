"""Pre-joining briefing for senior officers (form OF-MA-010).

Flow: admin assigns a briefing (one briefer per department) -> each briefer
fills + approves their section -> fixed Technical Director and Managing
Director approve -> the senior officer reviews and acknowledges. Every sign-off
records the signer's name + an IST timestamp.

Office people are ordinary admins with the `briefing` module; their
`department` picks which section they can be assigned, and `designation`
(technical_director / managing_director) marks the two fixed approvers.
"""
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, briefing_template as tpl
from app.auth import (get_current_user, require_module, user_modules, normalize_name)
from app.notifications_service import notify
from app.time_utils import to_ist_iso, IST

router = APIRouter(tags=["Briefing"])

SENIOR_RANKS = ("MASTER", "CHIEF OFFICER", "CHIEF ENGINEER", "SECOND ENGINEER")
CANDIDATES_CAP = 200
ACTIVE_STATUSES = ("in_progress", "awaiting_directors", "awaiting_crew")


def now_ist() -> datetime:
    """Naive IST wall-clock (DB timestamps are IST — see time_utils.to_ist_iso)."""
    return datetime.now(IST).replace(tzinfo=None)


# ------------------------------------------------------------------ helpers

def _has_module(user) -> bool:
    return "briefing" in user_modules(user)


def _restricted(user) -> bool:
    """Department briefers (an admin with a department who isn't the TD/MD) only
    ever see the sections assigned to them — never other departments' answers,
    the full list, or the full PDF. Super admins, the directors, admins without
    a department (coordinators) and the officer see the whole briefing."""
    return (user.role == "admin" and bool(user.department)
            and not user.designation)


def require_coordinator(user=Depends(require_module("briefing"))):
    if _restricted(user):
        raise HTTPException(403, "Department briefers can only open their own briefing tasks")
    return user


def _get_briefing(db: Session, briefing_id: str) -> models.Briefing:
    b = db.get(models.Briefing, briefing_id)
    if not b:
        raise HTTPException(404, "Briefing not found")
    return b


def _check_view(user, b: models.Briefing):
    if user.id == b.learner_id:
        return
    if _has_module(user):
        if not _restricted(user) or any(s.briefer_id == user.id for s in b.sections):
            return
    raise HTTPException(403, "You do not have access to this briefing")


def _section(b: models.Briefing, department: str) -> models.BriefingSection:
    if department not in tpl.DEPARTMENTS:
        raise HTTPException(404, "Unknown department")
    for s in b.sections:
        if s.department == department:
            return s
    raise HTTPException(404, "Section not found")


def _clean_answers(department: str, answers: dict | None) -> dict:
    valid = {k for k, _ in tpl.SECTIONS[department]}
    out = {}
    for key, val in (answers or {}).items():
        if key not in valid or not isinstance(val, dict):
            continue
        resp = val.get("response")
        if resp not in (None, *tpl.RESPONSES):
            raise HTTPException(400, f"Invalid response for item {key}")
        remarks = (val.get("remarks") or "").strip()[:2000]
        out[key] = {"response": resp, "remarks": remarks}
    return out


def _designated(db: Session, designation: str):
    return (db.query(models.User)
            .filter(models.User.role.in_(["admin", "super_admin"]),
                    models.User.designation == designation,
                    models.User.is_active == True)  # noqa: E712
            .first())


def _briefing_summary(db: Session, b: models.Briefing) -> dict:
    learner = db.get(models.User, b.learner_id)
    return {
        "id": b.id, "status": b.status,
        "learnerId": b.learner_id,
        "learnerName": learner.full_name if learner else None,
        "crewId": learner.crew_id if learner else None,
        "rank": b.rank, "joiningVessel": b.joining_vessel,
        "briefingDate": b.briefing_date.isoformat() if b.briefing_date else None,
        "createdAt": to_ist_iso(b.created_at),
        "sectionsDone": sum(1 for s in b.sections if s.status == "approved"),
        "sectionsTotal": len(b.sections),
        "tdDone": b.td_at is not None, "mdDone": b.md_at is not None,
    }


def _briefing_view(db: Session, b: models.Briefing, viewer) -> dict:
    """Full payload. Flags (canEdit / canApprove / canAcknowledge) are
    computed for `viewer` so the frontend never has to guess permissions."""
    v = _briefing_summary(db, b)
    sections = []
    restricted = _restricted(viewer)
    for s in sorted(b.sections, key=lambda x: tpl.DEPARTMENTS.index(x.department)):
        if restricted and s.briefer_id != viewer.id:
            continue
        briefer = db.get(models.User, s.briefer_id)
        sections.append({
            "department": s.department,
            "label": tpl.DEPARTMENT_LABELS[s.department],
            "brieferId": s.briefer_id,
            "brieferName": briefer.full_name if briefer else None,
            "status": s.status,
            "approvedByName": s.approved_by_name,
            "approvedAt": to_ist_iso(s.approved_at),
            "answers": s.answers or {},
            "items": tpl.section_items(s.department),
            "canEdit": (s.briefer_id == viewer.id and s.status == "pending"
                        and b.status == "in_progress"),
        })
    td_user = _designated(db, "technical_director")
    md_user = _designated(db, "managing_director")
    v.update({
        "form": {"formNo": tpl.FORM_NO, "revision": tpl.REVISION,
                 "revisionDate": tpl.REVISION_DATE, "title": tpl.TITLE,
                 "intro": tpl.INTRO, "confirmation": tpl.CONFIRMATION},
        "sections": sections,
        "td": {"name": b.td_name, "at": to_ist_iso(b.td_at),
               "assignedName": td_user.full_name if td_user else None},
        "md": {"name": b.md_name, "at": to_ist_iso(b.md_at),
               "assignedName": md_user.full_name if md_user else None},
        "canApprove": (b.status == "awaiting_directors" and (
            (viewer.designation == "technical_director" and b.td_at is None) or
            (viewer.designation == "managing_director" and b.md_at is None))),
        "crewComments": b.crew_comments,
        "crewAckAt": to_ist_iso(b.crew_ack_at),
        "canAcknowledge": viewer.id == b.learner_id and b.status == "awaiting_crew",
        "canDelete": (_has_module(viewer) and not restricted
                      and viewer.role in ("admin", "super_admin")),
        "restricted": restricted,
    })
    return v


def _all_sections_done(b: models.Briefing) -> bool:
    return len(b.sections) == len(tpl.DEPARTMENTS) and all(
        s.status == "approved" for s in b.sections)


# ------------------------------------------------------------------ admin: assign

@router.get("/api/admin/briefings/candidates")
def briefing_candidates(q: str = "", rank: str | None = None, vessel: str | None = None,
                        all_ranks: bool = False,
                        admin: models.User = Depends(require_coordinator),
                        db: Session = Depends(get_db)):
    """Crew search for assignment. Defaults to senior officer ranks."""
    rows = db.query(models.User).filter(
        models.User.role == "learner", models.User.is_active == True).all()  # noqa: E712
    needle = normalize_name(q)
    rank_f = (rank or "").strip().upper()
    vessel_f = (vessel or "").strip().upper()
    active = {b.learner_id: b for b in db.query(models.Briefing)
              .filter(models.Briefing.status.in_(ACTIVE_STATUSES)).all()}
    out = []
    for u in rows:
        r = (u.rank or "").strip().upper()
        if r == "OFFICE STAFF":
            continue
        if rank_f:
            if r != rank_f:
                continue
        elif not all_ranks and r not in SENIOR_RANKS:
            continue
        if vessel_f and (u.current_vessel or "").strip().upper() != vessel_f:
            continue
        if needle and needle not in normalize_name(u.full_name) \
                and needle not in normalize_name(u.crew_id or ""):
            continue
        ab = active.get(u.id)
        out.append({
            "id": u.id, "name": u.full_name, "crewId": u.crew_id, "rank": u.rank,
            "currentVessel": u.current_vessel, "empStatus": u.emp_status,
            "nationality": u.nationality,
            "activeBriefingId": ab.id if ab else None,
            "activeBriefingStatus": ab.status if ab else None,
        })
    out.sort(key=lambda x: (x["name"] or "").casefold())
    return {"total": len(out), "items": out[:CANDIDATES_CAP]}


@router.get("/api/admin/briefings/briefers")
def briefing_briefers(admin: models.User = Depends(require_coordinator),
                      db: Session = Depends(get_db)):
    """Admins eligible to brief, grouped by department, plus the fixed TD/MD."""
    admins = (db.query(models.User)
              .filter(models.User.role.in_(["admin", "super_admin"]),
                      models.User.is_active == True)  # noqa: E712
              .order_by(models.User.full_name).all())
    by_dept = {d: [] for d in tpl.DEPARTMENTS}
    for u in admins:
        if u.department in by_dept and _has_module(u):
            by_dept[u.department].append(
                {"id": u.id, "name": u.full_name, "email": u.email})
    td, md = _designated(db, "technical_director"), _designated(db, "managing_director")
    return {
        "departments": [{"department": d, "label": tpl.DEPARTMENT_LABELS[d],
                         "briefers": by_dept[d]} for d in tpl.DEPARTMENTS],
        "technicalDirector": {"id": td.id, "name": td.full_name} if td else None,
        "managingDirector": {"id": md.id, "name": md.full_name} if md else None,
    }


class CreateBriefingRequest(BaseModel):
    learnerId: str
    joiningVessel: str | None = None
    briefingDate: str | None = None          # YYYY-MM-DD
    briefers: dict[str, str]                 # department -> admin user id


def _validate_briefer(db, department, user_id):
    u = db.get(models.User, user_id)
    if (not u or not u.is_active or u.role not in ("admin", "super_admin")
            or not _has_module(u)):
        raise HTTPException(400, f"Invalid briefer for {tpl.DEPARTMENT_LABELS[department]}")
    if u.department != department:
        raise HTTPException(400, f"{u.full_name} is not in the "
                                 f"{tpl.DEPARTMENT_LABELS[department]} department")
    return u


@router.post("/api/admin/briefings")
def create_briefing(req: CreateBriefingRequest,
                    admin: models.User = Depends(require_coordinator),
                    db: Session = Depends(get_db)):
    learner = db.get(models.User, req.learnerId)
    if not learner or learner.role != "learner" or not learner.is_active:
        raise HTTPException(404, "Crew member not found")
    if (db.query(models.Briefing)
            .filter(models.Briefing.learner_id == learner.id,
                    models.Briefing.status.in_(ACTIVE_STATUSES)).first()):
        raise HTTPException(400, "This crew member already has a briefing in progress")
    if not _designated(db, "technical_director") or not _designated(db, "managing_director"):
        raise HTTPException(400, "Technical Director and Managing Director must be "
                                 "set up (User management) before assigning a briefing")
    missing = [d for d in tpl.DEPARTMENTS if not req.briefers.get(d)]
    if missing:
        raise HTTPException(400, "Select a briefer for every department")
    briefers = {d: _validate_briefer(db, d, req.briefers[d]) for d in tpl.DEPARTMENTS}

    bdate = now_ist().date()
    if req.briefingDate:
        try:
            bdate = date.fromisoformat(req.briefingDate)
        except ValueError:
            raise HTTPException(400, "Briefing date must be YYYY-MM-DD")

    b = models.Briefing(
        learner_id=learner.id, assigned_by=admin.id, rank=learner.rank,
        joining_vessel=(req.joiningVessel or learner.current_vessel or "").strip() or None,
        briefing_date=bdate, status="in_progress")
    db.add(b)
    db.flush()
    for d in tpl.DEPARTMENTS:
        db.add(models.BriefingSection(briefing_id=b.id, department=d,
                                      briefer_id=briefers[d].id, answers={}))
        notify(db, briefers[d].id, "briefing",
               "Pre-joining briefing assigned",
               f"You have a {tpl.DEPARTMENT_LABELS[d]} briefing for {learner.full_name}"
               f" ({learner.rank or 'senior officer'})"
               f"{' joining ' + b.joining_vessel if b.joining_vessel else ''}.",
               f"/admin/briefings/{b.id}")
    db.commit()
    db.refresh(b)
    return _briefing_view(db, b, admin)


@router.get("/api/admin/briefings")
def list_briefings(status: str | None = None,
                   admin: models.User = Depends(require_coordinator),
                   db: Session = Depends(get_db)):
    q = db.query(models.Briefing)
    if status:
        q = q.filter(models.Briefing.status == status)
    rows = q.order_by(models.Briefing.created_at.desc()).all()
    return [_briefing_summary(db, b) for b in rows]


class ReassignRequest(BaseModel):
    brieferId: str


@router.put("/api/admin/briefings/{briefing_id}/sections/{department}/briefer")
def reassign_briefer(briefing_id: str, department: str, req: ReassignRequest,
                     admin: models.User = Depends(require_coordinator),
                     db: Session = Depends(get_db)):
    b = _get_briefing(db, briefing_id)
    s = _section(b, department)
    if s.status == "approved":
        raise HTTPException(400, "This section is already approved")
    u = _validate_briefer(db, department, req.brieferId)
    if u.id != s.briefer_id:
        s.briefer_id = u.id
        learner = db.get(models.User, b.learner_id)
        notify(db, u.id, "briefing", "Pre-joining briefing assigned",
               f"You have a {tpl.DEPARTMENT_LABELS[department]} briefing for "
               f"{learner.full_name if learner else 'a senior officer'}.",
               f"/admin/briefings/{b.id}")
    db.commit()
    return _briefing_view(db, b, admin)


@router.delete("/api/admin/briefings/{briefing_id}")
def delete_briefing(briefing_id: str,
                    admin: models.User = Depends(require_coordinator),
                    db: Session = Depends(get_db)):
    b = _get_briefing(db, briefing_id)
    db.delete(b)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ office: fill + approve

@router.get("/api/briefings/my-tasks")
def my_tasks(user: models.User = Depends(require_module("briefing")),
             db: Session = Depends(get_db)):
    """Sections assigned to me and (for TD/MD) briefings awaiting my approval."""
    sections = (db.query(models.BriefingSection)
                .filter(models.BriefingSection.briefer_id == user.id).all())
    tasks = []
    for s in sections:
        b = s.briefing
        item = _briefing_summary(db, b)
        item.update({"department": s.department,
                     "label": tpl.DEPARTMENT_LABELS[s.department],
                     "sectionStatus": s.status})
        tasks.append(item)
    directors = []
    if user.designation in ("technical_director", "managing_director"):
        for b in db.query(models.Briefing).filter(
                models.Briefing.status == "awaiting_directors").all():
            slot_done = b.td_at if user.designation == "technical_director" else b.md_at
            if not slot_done:
                directors.append(_briefing_summary(db, b))
    tasks.sort(key=lambda t: (t["sectionStatus"] == "approved", t["createdAt"] or ""))
    return {"sections": tasks, "directorApprovals": directors,
            "designation": user.designation, "department": user.department}


class SectionAnswers(BaseModel):
    answers: dict = {}


def _editable_section(db, user, briefing_id, department):
    b = _get_briefing(db, briefing_id)
    s = _section(b, department)
    if s.briefer_id != user.id:
        raise HTTPException(403, "This section is assigned to someone else")
    if s.status == "approved" or b.status != "in_progress":
        raise HTTPException(400, "This section is already approved and locked")
    return b, s


@router.put("/api/briefings/{briefing_id}/sections/{department}")
def save_section(briefing_id: str, department: str, req: SectionAnswers,
                 user: models.User = Depends(require_module("briefing")),
                 db: Session = Depends(get_db)):
    b, s = _editable_section(db, user, briefing_id, department)
    s.answers = _clean_answers(department, req.answers)
    db.commit()
    return _briefing_view(db, b, user)


@router.post("/api/briefings/{briefing_id}/sections/{department}/approve")
def approve_section(briefing_id: str, department: str, req: SectionAnswers,
                    user: models.User = Depends(require_module("briefing")),
                    db: Session = Depends(get_db)):
    b, s = _editable_section(db, user, briefing_id, department)
    answers = _clean_answers(department, req.answers) if req.answers else (s.answers or {})
    unanswered = [k for k, _ in tpl.SECTIONS[department]
                  if not (answers.get(k) or {}).get("response")]
    if unanswered:
        raise HTTPException(400, f"Answer every item (Yes / No / N/A) before approving "
                                 f"— {len(unanswered)} remaining")
    s.answers = answers
    s.status = "approved"
    s.approved_by_name = user.full_name
    s.approved_at = now_ist()
    db.flush()
    if _all_sections_done(b):
        b.status = "awaiting_directors"
        learner = db.get(models.User, b.learner_id)
        for desig in ("technical_director", "managing_director"):
            d = _designated(db, desig)
            if d:
                notify(db, d.id, "briefing", "Briefing awaiting your approval",
                       f"All departments have briefed {learner.full_name if learner else 'the officer'}. "
                       f"Please review and approve.",
                       f"/admin/briefings/{b.id}")
    db.commit()
    return _briefing_view(db, b, user)


@router.post("/api/briefings/{briefing_id}/director-approve")
def director_approve(briefing_id: str,
                     user: models.User = Depends(require_module("briefing")),
                     db: Session = Depends(get_db)):
    b = _get_briefing(db, briefing_id)
    if user.designation not in ("technical_director", "managing_director"):
        raise HTTPException(403, "Only the Technical Director or Managing Director can approve")
    if b.status != "awaiting_directors":
        raise HTTPException(400, "This briefing is not awaiting director approval")
    stamp = now_ist()
    if user.designation == "technical_director":
        if b.td_at:
            raise HTTPException(400, "Already approved by the Technical Director")
        b.td_user_id, b.td_name, b.td_at = user.id, user.full_name, stamp
    else:
        if b.md_at:
            raise HTTPException(400, "Already approved by the Managing Director")
        b.md_user_id, b.md_name, b.md_at = user.id, user.full_name, stamp
    if b.td_at and b.md_at:
        b.status = "awaiting_crew"
        notify(db, b.learner_id, "briefing", "Your pre-joining briefing is ready",
               "All departments and directors have signed. Please review and confirm.",
               "/pre-joining-briefing")
    db.commit()
    return _briefing_view(db, b, user)


# ------------------------------------------------------------------ crew

@router.get("/api/my/briefing")
def my_briefing(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The signed-in officer's most recent briefing (None if none)."""
    b = (db.query(models.Briefing).filter(models.Briefing.learner_id == user.id)
         .order_by(models.Briefing.created_at.desc()).first())
    return _briefing_view(db, b, user) if b else None


class AcknowledgeRequest(BaseModel):
    comments: str | None = None


@router.post("/api/briefings/{briefing_id}/acknowledge")
def acknowledge(briefing_id: str, req: AcknowledgeRequest,
                user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = _get_briefing(db, briefing_id)
    if b.learner_id != user.id:
        raise HTTPException(403, "This briefing is not yours")
    if b.status != "awaiting_crew":
        raise HTTPException(400, "This briefing is not ready for your confirmation")
    b.crew_comments = (req.comments or "").strip()[:4000] or None
    b.crew_ack_at = now_ist()
    b.status = "completed"
    if b.assigned_by:
        notify(db, b.assigned_by, "briefing", "Briefing completed",
               f"{user.full_name} has confirmed the pre-joining briefing.",
               f"/admin/briefings/{b.id}")
    db.commit()
    return _briefing_view(db, b, user)


# ------------------------------------------------------------------ shared

@router.get("/api/briefings/{briefing_id}")
def get_briefing(briefing_id: str, user: models.User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    b = _get_briefing(db, briefing_id)
    _check_view(user, b)
    return _briefing_view(db, b, user)


@router.get("/api/briefings/{briefing_id}/pdf")
def briefing_pdf(briefing_id: str, user: models.User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    from app.briefing_pdf import build_briefing_pdf
    b = _get_briefing(db, briefing_id)
    _check_view(user, b)
    if _restricted(user):
        raise HTTPException(403, "The full briefing PDF is not available to department briefers")
    learner = db.get(models.User, b.learner_id)
    pdf = build_briefing_pdf(b, learner)
    name = "".join(c if c.isalnum() else "_" for c in (learner.full_name if learner else "briefing"))
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition":
                             f'inline; filename="Pre-joining_briefing_{name}.pdf"'})
