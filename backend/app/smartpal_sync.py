"""SmartPAL (CrewingPALApp) crew-data sync.

SmartPAL sits behind Azure AD SSO with a short-lived session (~20 min). The
crew-list endpoint (a generic `ServiceRouter` dispatcher) does NOT use cookie
auth — it's dispatched via request headers (`s_key`, `v_cmpid`, `v_coid`,
`v_coname`, `servicepath`, ...) that SmartPAL embeds as inline `window.*` JS
globals on `{BASE_URL}/CrewingPALApp/crewing/QueryActivity` (confirmed
against a real HAR capture — `request.cookies` is empty on the working call,
and those globals are NOT present on `/Home/Landing`, the generic post-SSO
landing page).

Header values alone are not enough, though: a plain `httpx` POST using the
exact captured headers/body was rejected with 401 "Authorization has been
denied for this request", while the identical request issued from inside the
already-authenticated page via its own `fetch()` succeeded. Since the HAR
shows no cookie on the working request either, the gap isn't cookies — it's
most likely a TLS/browser fingerprint check (JA3, `navigator.webdriver`, or
similar) that a non-browser HTTP client can't replicate. So Playwright drives
BOTH the login and the actual paginated data fetch (via page.evaluate calling
fetch() in-page) — it never runs inside a request path of this app, only
inside this scheduled sync job.

Run manually for testing:  python -m app.smartpal_sync
Scheduled via APScheduler from main.py's startup event, 7am/7pm IST.

Upsert key: SmartPAL's `empId` -> User.emp_id (a separate internal column,
never shown to users). `empNo` populates User.crew_id, the human-facing
Login ID — existing crew_id-based login logic in auth.py is untouched.
Only SmartPAL-owned fields are written; email/password_hash/role/is_active
are never touched by this job. Users missing from a sync response are left
alone (no deactivation).
"""
import asyncio
import os
from datetime import datetime, date, timezone
from zoneinfo import ZoneInfo

from playwright.async_api import async_playwright
from sqlalchemy.exc import IntegrityError

from .database import SessionLocal
from . import models

IST = ZoneInfo("Asia/Kolkata")

BASE_URL = os.getenv("SMARTPAL_BASE_URL", "https://smartpal.ozellar.com")
LOGIN_URL = f"{BASE_URL}/Home/Account/Index"
LANDING_URL_PART = "/Home/Landing"
QUERY_ACTIVITY_URL = f"{BASE_URL}/CrewingPALApp/crewing/QueryActivity"
SERVICE_ROUTER_URL = f"{BASE_URL}/CrewingPALApp/api/ServiceRouter/POST"

USERNAME = os.getenv("SMARTPAL_USERNAME")
PASSWORD = os.getenv("SMARTPAL_PASSWORD")

PAGE_SIZE = int(os.getenv("SMARTPAL_PAGE_SIZE", "100"))
MAX_PAGES = 100   # safety cap — real crew lists are nowhere near 10,000 rows

DEBUG = os.getenv("SMARTPAL_DEBUG", "").lower() in ("1", "true", "yes")


def _debug(msg: str):
    if DEBUG:
        print(f"[smartpal_sync] {msg}")


def _int_list(env_name: str) -> list:
    raw = os.getenv(env_name, "")
    return [int(x) for x in raw.split(",") if x.strip()]


SDC_LIST = _int_list("SMARTPAL_SDC_LIST")
RANK_LIST = _int_list("SMARTPAL_RANK_LIST")

if not SDC_LIST or not RANK_LIST:
    print("[smartpal_sync] warning: SMARTPAL_SDC_LIST or SMARTPAL_RANK_LIST is "
          "empty — the request will be sent with an empty list, which some "
          "SmartPAL endpoints reject with a 500")


def _request_body(offset: int, page_num: int) -> dict:
    """Matches a real captured GetQueryActivitylist request field-for-field
    (see module docstring) — only SDCList/RankList/pagination are varied;
    every other field is a fixed value the working request used."""
    return {
        "SDCList": SDC_LIST, "CSCList": [], "OWNList": [], "EXAList": [],
        "WorkGroupList": [], "RankGroupList": [],
        "RankList": RANK_LIST,
        "NationalityList": [], "CountryofOperationId": -1,
        "VesselSubTypeList": [], "VesselList": [], "SubcompanyList": [],
        "ManagementType": "", "VesselCategoryList": [], "VesselTypeList": [],
        "EngineMakeList": [], "ModelIds": None,
        "RankCategoryList": [], "RankDepartmentList": [], "ReportingRankGroupList": [],
        "RankFunctionalList": [], "ShowCriteria": False, "IncludeInactive": "Y",
        "IncludeFuture": "Y", "ServiceStatus": "", "FlagList": [],
        "RegisteredOwnerList": [], "IncludeNonReal": "N", "MyAllVessel": "N",
        "rankArray": None, "checkForArray": None, "docNationalityArray": None,
        "ExpBefore": "RDP", "reliefDue": 0, "searchFlag": True, "ExpMissing": "VT",
        "selectFrom": None, "SortOrder": None, "EmpStatus": "", "ActivityId": "",
        "PayScaleId": "", "IsVisaValid": "", "CourseId": "", "USVisa": "SA",
        "IsHighlightExp": "N", "IsLicenseOrCourse": "LE", "ListDoc": "AL",
        "GetDocs": "Y", "ListType": "LS", "EmpLabel": "EM",
        "ReportingNationalityList": [], "CheckForExpiry": "HE",
        "offset": offset, "pageSize": PAGE_SIZE,
        "gridServerOperations": {"filters": None, "page": page_num, "pageSize": PAGE_SIZE},
        "TravelDocId": "", "MedicalDocId": "",
    }


def build_headers(session_info: dict) -> dict:
    """Header set matched field-for-field against a real working HAR
    capture. Everything except s_key/v_cmpid/v_coid/v_coname is a fixed
    constant for this one action (GetQueryActivitylist, all vessels, no
    company filter) — see module docstring."""
    return {
        "Content-Type": "application/json; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "app_code": "CRW",
        "servicepath": "Crewing/QueryActivity/GetQueryActivitylist",
        "s_key": str(session_info["sKey"]),
        "v_cmpid": str(session_info["companyId"]),
        "v_coid": str(session_info["companyId"]),
        "v_coname": session_info["companyName"],
        "v_code": "undefined",              # literal string, not omitted
        "v_id": "-2",
        "v_isallvessels": "false",
        "v_name": "All Vessels",
        "v_objectid": "-2",
        "iscompanyfilteractive": "false",
    }


# ======================= Playwright login =======================
async def _login_and_capture(page) -> dict:
    """Drive the Azure AD SSO flow on an already-open page, then load the
    QueryActivity page and read the session/company globals it embeds
    inline as `window.*` JS variables. Returns
    {sKey, companyId, companyName, userId}."""
    if not USERNAME or not PASSWORD:
        raise RuntimeError("SMARTPAL_USERNAME / SMARTPAL_PASSWORD are not set")

    await page.goto(LOGIN_URL, wait_until="networkidle")

    # "SIGN-IN WITH" -> Microsoft account link (the phrase below is
    # unique on the page; the "OTHER USERS" form also has a button
    # labelled just "SIGN IN", so we can't match on that text alone).
    await page.locator("a:has-text('Login with your Microsoft account')").click()

    # Azure AD: email screen
    await page.wait_for_selector("#i0116", timeout=30_000)
    await page.fill("#i0116", USERNAME)
    await page.click("#idSIButton9")

    # Azure AD: password screen
    await page.wait_for_selector("#i0118", timeout=30_000)
    await page.fill("#i0118", PASSWORD)
    await page.click("#idSIButton9")

    # Optional "Stay signed in?" interstitial — dismiss with Yes if it
    # shows up; if the app already redirected past it, this just
    # times out quietly and we move on.
    try:
        await page.wait_for_selector("#idSIButton9", timeout=8_000)
        if LANDING_URL_PART not in page.url:
            await page.click("#idSIButton9")
    except Exception:
        pass

    await page.wait_for_url(f"**{LANDING_URL_PART}**", timeout=30_000)

    # The session/company globals live on the QueryActivity page,
    # not on the generic post-SSO landing page.
    await page.goto(QUERY_ACTIVITY_URL, wait_until="networkidle")
    session_info = await page.evaluate("""() => ({
        sKey: window.userSessionId,
        companyId: window.DefaultAppCompanyId,
        companyName: window.DefaultAppCompanyName,
        userId: window.userId,
    })""")
    _debug(f"landed on {page.url!r} after login; session_info={session_info!r}")
    if not session_info.get("sKey") or not session_info.get("companyId"):
        raise RuntimeError(
            f"Could not read session globals from {QUERY_ACTIVITY_URL} "
            f"(got {session_info!r}) — page structure may have changed")
    return session_info


# ======================= crew-list fetch =======================
# A plain httpx POST with these exact headers/body was rejected 401 even
# though the same request succeeds from inside the browser (see module
# docstring) — so the fetch itself runs in-page via page.evaluate(fetch()).
_FETCH_JS = """async ({url, headers, body}) => {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return { status: res.status, json, text: text.slice(0, 1000) };
}"""


async def fetch_crew_page(page, headers: dict, offset: int, page_num: int) -> dict:
    result = await page.evaluate(
        _FETCH_JS,
        {"url": SERVICE_ROUTER_URL, "headers": headers, "body": _request_body(offset, page_num)},
    )
    status, data = result["status"], result.get("json")
    _debug(f"page {page_num} (offset={offset}) -> status={status}")
    if status in (401, 403):
        raise PermissionError(f"SmartPAL session rejected ({status})")
    if status >= 400 or data is None:
        # surface the server's own error body — a bare status code alone
        # isn't diagnosable on its own.
        raise RuntimeError(f"SmartPAL returned {status}: {result.get('text')}")
    if data.get("isError") or data.get("statusCode") != 200:
        raise PermissionError(f"SmartPAL returned an error payload: {data.get('validationMessages')}")
    return data


async def fetch_crew(page, session_info: dict) -> list:
    """Paginates through GetQueryActivitylist (pageSize/offset in the body,
    `total` in every returned record) until every record is fetched."""
    headers = build_headers(session_info)
    all_records = []
    offset, page_num, total = 0, 1, None

    while True:
        data = await fetch_crew_page(page, headers, offset, page_num)
        records = data.get("result") or []
        all_records.extend(records)
        if total is None and records:
            total = records[0].get("total")

        if not records or len(records) < PAGE_SIZE:
            break                       # short page = last page
        if total is not None and len(all_records) >= total:
            break
        if page_num >= MAX_PAGES:
            print(f"[smartpal_sync] warning: hit MAX_PAGES={MAX_PAGES} — "
                  f"stopping early with {len(all_records)} of {total} records")
            break

        offset += PAGE_SIZE
        page_num += 1

    return all_records


async def fetch_crew_with_retry() -> list:
    """Login, fetch; on an auth-shaped failure, log in once more and retry.
    Browser stays open for the whole fetch (login + every paginated call)
    and is only closed here, once, when we're completely done."""
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            page = await (await browser.new_context()).new_page()
            session_info = await _login_and_capture(page)
            try:
                return await fetch_crew(page, session_info)
            except PermissionError:
                page = await (await browser.new_context()).new_page()
                session_info = await _login_and_capture(page)
                return await fetch_crew(page, session_info)
        finally:
            await browser.close()


# ======================= parsing helpers =======================
def combine_name(first, middle, last) -> str:
    parts = [p.strip() for p in (first, middle, last) if p and p.strip()]
    return " ".join(" ".join(parts).split())


def parse_iso_date(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).date()
    except ValueError:
        # tolerate a bare "YYYY-MM-DD" too
        try:
            return date.fromisoformat(s[:10])
        except ValueError:
            return None


# ======================= upsert =======================
def upsert_crew_record(db, rec: dict, now: datetime) -> str:
    """Returns 'created' | 'updated' | 'error'. Never touches email,
    password_hash, role, or is_active on an existing row."""
    emp_id = rec.get("empId")
    if emp_id is None:
        return "error"

    full_name = combine_name(rec.get("firstName"), rec.get("middleName"), rec.get("surName"))
    dob = parse_iso_date(rec.get("dob"))
    fields = dict(
        crew_id=rec.get("empNo"),
        full_name=full_name,
        rank=rec.get("rankName"),
        date_of_birth=dob,
        pp_no=rec.get("passportNo"),
        nationality=rec.get("nationality"),
        emp_status=rec.get("empStatus"),
        current_vessel=rec.get("vslName"),
        seamen_book_no=rec.get("seamenBookNo"),
        birth_place=rec.get("birth_place"),
        smartpal_synced_at=now,
    )

    try:
        user = db.query(models.User).filter_by(emp_id=emp_id).first()
        if user:
            for k, v in fields.items():
                setattr(user, k, v)
            db.flush()
            return "updated"
        else:
            db.add(models.User(role="learner", emp_id=emp_id, is_active=True,
                               password_hash=None, **fields))
            db.flush()
            return "created"
    except IntegrityError as e:
        db.rollback()
        print(f"[smartpal_sync] skipped empId={emp_id} empNo={rec.get('empNo')}: {e}")
        return "error"


# ======================= run =======================
async def run_sync():
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    log = models.SyncLog(status="failed")   # pessimistic default; upgraded below
    db.add(log)
    db.commit()

    try:
        records = await fetch_crew_with_retry()
        created = updated = errors = 0
        for rec in records:
            result = upsert_crew_record(db, rec, now)
            if result == "created":
                created += 1
            elif result == "updated":
                updated += 1
            else:
                errors += 1
        db.commit()

        log.records_fetched = len(records)
        log.records_created = created
        log.records_updated = updated
        log.status = "partial" if errors else "success"
        if errors:
            log.error_message = f"{errors} record(s) failed to upsert — see server log"
    except Exception as e:
        db.rollback()
        log.status = "failed"
        log.error_message = str(e)[:2000]
    finally:
        log.finished_at = datetime.now(timezone.utc)
        db.commit()
        db.close()


def schedule_jobs(scheduler):
    """Register the 7am/7pm IST sync jobs on an already-created AsyncIOScheduler."""
    from apscheduler.triggers.cron import CronTrigger
    scheduler.add_job(run_sync, CronTrigger(hour=7, minute=0, timezone=IST),
                      id="smartpal_sync_morning", replace_existing=True)
    scheduler.add_job(run_sync, CronTrigger(hour=19, minute=0, timezone=IST),
                      id="smartpal_sync_evening", replace_existing=True)


if __name__ == "__main__":
    asyncio.run(run_sync())
