"""Rank hierarchy for the Orientation Program feature.

Deck and engine rank ladders, most senior first, plus ranks excluded from
Orientation Program entirely (shore-based/office staff, not onboard
rotational crew). These are free-text labels matched against `User.rank`
(itself a free-text string synced verbatim from SmartPAL's `rankName` —
see `smartpal_sync.py`).

Verified against a live SmartPAL crew export (782 records, 34 distinct
ranks) on 2026-09-10. Real data is uppercase (e.g. "CHIEF OFFICER"); a
couple of mixed-case leftovers exist from local demo/seed data (e.g.
"Chief Officer" for the seeded demo user) — matching below is
case-insensitive so both forms work. This fleet's SmartPAL data has no
"FOURTH OFFICER" rank at all, so the deck ladder tops out at Third Officer
here; add it back if a vessel with that rank ever appears.
"""

DECK_RANKS = [
    "MASTER",
    "CHIEF OFFICER",
    "SECOND OFFICER",
    "THIRD OFFICER",
]

ENGINE_RANKS = [
    "CHIEF ENGINEER",
    "SECOND ENGINEER",
    "THIRD ENGINEER",
    "FOURTH ENGINEER",
]

# Shore-based ranks that should never be enrollable in Orientation Program,
# nor count as an onboard Master/Chief Engineer. "OFFICE STAFF" is the
# confirmed literal SmartPAL rank name for shore/office roles.
EXCLUDED_RANKS = [
    "OFFICE STAFF",
]


def _norm(rank: str) -> str:
    return (rank or "").strip().upper()


def department_for_rank(rank: str) -> str | None:
    """'deck' | 'engine' | None (unknown / excluded rank)."""
    r = _norm(rank)
    if not r or r in EXCLUDED_RANKS:
        return None
    if r in DECK_RANKS:
        return "deck"
    if r in ENGINE_RANKS:
        return "engine"
    return None


def is_eligible_crew(rank: str) -> bool:
    """Whether a crew member's rank makes them eligible for Orientation
    Program at all (i.e. a real onboard deck/engine officer rank, not
    office staff, a rating/cadet/fitter, or an unrecognised rank)."""
    return department_for_rank(rank) is not None


def vessel_approver_info(user) -> dict | None:
    """Whether `user` currently qualifies as a vessel-level Orientation
    Program approver — an onboard Master or Chief Engineer — with no
    separate approver account: eligibility is derived live from their own
    crew record (same rows synced by smartpal_sync.py/crewlist_sync.py).

    Returns {'vessel': str, 'department': 'deck'|'engine'} if they qualify,
    else None. Deliberately narrower than department_for_rank()/
    is_eligible_crew() (which cover the full 4-rank deck/engine ladders for
    *enrollment* eligibility) — approver status is only the single top rank
    per department, and only while actively on sail on an assigned vessel.
    """
    r = _norm(getattr(user, "rank", None))
    if r not in ("MASTER", "CHIEF ENGINEER"):
        return None
    if _norm(getattr(user, "emp_status", None)) != "SAIL":
        return None
    vessel = (getattr(user, "current_vessel", None) or "").strip()
    if not vessel:
        return None
    return {"vessel": vessel, "department": "deck" if r == "MASTER" else "engine"}
