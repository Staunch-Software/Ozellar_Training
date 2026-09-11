"""SmartPAL "Crew List" sync — pulls crew from the Crew List page
(`{BASE_URL}/CrewingPALApp/crewing/Crewlist`, servicepath
`Crewing/Crewlist/GetCrewlist`). This is a **different report** from
`smartpal_sync.py`'s QueryActivity sync (different servicepath, different
default scope — "My Vessels" + active service statuses only) — confirmed
by inspecting the live page's own network traffic. Use this one; it's the
page actually used day-to-day, per instruction.

Mechanics mirror `smartpal_sync.py` (same Azure AD SSO, same "must run
inside an authenticated page, a bare httpx call gets 401" constraint) but
drive the real Crewlist page instead of reconstructing headers by hand:

  1. Log in (Playwright, Azure AD SSO).
  2. Load the Crewlist page — its own JS resolves the default vessel scope,
     so we never hardcode a vessel list.
  3. In the Rank filter <select id="reportsearchfilterRanks_RANK">, select
     every option EXCEPT "Office Staff" (matched by option *text*, not a
     hardcoded rank id — a future new rank is included automatically, and
     only Office Staff is ever excluded, per instruction: "select all rank
     then exclude the office staff rank by deselect that").
  4. Click the page's own "Show" button (data-bind: PopulateCrewListData,
     class btn-icon-apply-search-result) to fetch page 1 — this also lets
     the page's own vessel-scope logic resolve VesselList for us.
  5. Paginate remaining pages via in-page `fetch()`, reusing the exact
     headers/body the real click produced (only offset/page vary) — same
     technique QueryActivity's sync uses for its own pagination.

Upserts into the same `User` rows as smartpal_sync.py (same emp_id upsert
key). Crewlist's response happens to use identical field names to
QueryActivity's (empId, empNo, firstName/middleName/surName, rankName,
dob, passportNo, nationality, empStatus, vslName, seamenBookNo), so
`upsert_crew_record` is reused unchanged. Confirmed (2026-09-11, live
response) to also carry `signOnDate` (current tour start) and
`reliefDate` (expected sign-off date) — both captured into
User.sign_on_date/relief_date and used by admin_list_orientation_vessels
to guess which of two same-rank Masters/CEs on one vessel is closer to
signing off.

Run manually (from backend/):  ./venv/Scripts/python.exe -m app.crewlist_sync
"""
import asyncio
import json
from datetime import datetime, timezone

from playwright.async_api import async_playwright

from .database import SessionLocal
from . import models
from .smartpal_sync import (
    BASE_URL, LOGIN_URL, LANDING_URL_PART, USERNAME, PASSWORD,
    upsert_crew_record,
)

CREWLIST_URL = f"{BASE_URL}/CrewingPALApp/crewing/Crewlist"
OFFICE_STAFF_RANK_NAME = "OFFICE STAFF"
MAX_PAGES = 100


async def _login(page):
    if not USERNAME or not PASSWORD:
        raise RuntimeError("SMARTPAL_USERNAME / SMARTPAL_PASSWORD are not set")

    await page.goto(LOGIN_URL, wait_until="networkidle")
    await page.locator("a:has-text('Login with your Microsoft account')").click()

    await page.wait_for_selector("#i0116", timeout=30_000)
    await page.fill("#i0116", USERNAME)
    await page.click("#idSIButton9")

    await page.wait_for_selector("#i0118", timeout=30_000)
    await page.fill("#i0118", PASSWORD)
    await page.click("#idSIButton9")

    try:
        await page.wait_for_selector("#idSIButton9", timeout=8_000)
        if LANDING_URL_PART not in page.url:
            await page.click("#idSIButton9")
    except Exception:
        pass

    await page.wait_for_url(f"**{LANDING_URL_PART}**", timeout=30_000)


async def _select_all_ranks_except_office_staff(page) -> int:
    """Selects every option in the Rank filter except 'Office Staff'
    (matched by option text). Returns how many options were excluded —
    caller should treat anything other than 1 as a hard error, since a
    markup/name change here would otherwise silently pull the wrong set."""
    return await page.evaluate("""(officeStaffName) => {
        const sel = document.querySelector('#reportsearchfilterRanks_RANK');
        if (!sel) return -1;
        let excluded = 0;
        for (const opt of sel.options) {
            const isOfficeStaff = opt.textContent.trim().toUpperCase() === officeStaffName;
            opt.selected = !isOfficeStaff;
            if (isOfficeStaff) excluded++;
        }
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.jQuery) {
            jQuery(sel).trigger('change');
            if (jQuery(sel).selectpicker) jQuery(sel).selectpicker('refresh');
        }
        return excluded;
    }""", OFFICE_STAFF_RANK_NAME)


async def fetch_crew() -> list:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            context = await browser.new_context()
            page = await context.new_page()

            print("[crewlist_sync] Logging in...")
            await _login(page)

            print(f"[crewlist_sync] Navigating to {CREWLIST_URL}")
            await page.goto(CREWLIST_URL, wait_until="networkidle", timeout=60_000)
            await page.wait_for_selector("#reportsearchfilterRanks_RANK", timeout=30_000)

            excluded = await _select_all_ranks_except_office_staff(page)
            if excluded != 1:
                raise RuntimeError(
                    f"Expected to exclude exactly 1 'Office Staff' rank option, excluded {excluded} — "
                    f"the Rank filter markup or the rank name may have changed on SmartPAL's side; "
                    f"check before trusting this sync's output.")
            await page.wait_for_timeout(500)

            print("[crewlist_sync] Clicking Show, waiting for the crew-list response...")
            async with page.expect_response(
                lambda r: r.request.method == "POST" and "ServiceRouter/POST" in r.url
                          and r.request.post_data and '"RankList"' in r.request.post_data
            ) as resp_info:
                await page.click(".btn-icon-apply-search-result")
            resp = await resp_info.value
            if resp.status != 200:
                raise RuntimeError(f"Crewlist page 1 returned HTTP {resp.status}")
            data = await resp.json()
            if data.get("isError") or data.get("statusCode") not in (None, 200):
                raise RuntimeError(f"Crewlist returned an error payload: {data.get('validationMessages')}")

            req = resp.request
            headers = await req.all_headers()
            headers = {k: v for k, v in headers.items()
                       if not k.startswith(":") and k.lower() not in ("content-length", "host", "connection")}
            body = json.loads(req.post_data)
            page_size = body.get("pageSize", 100)

            all_records = list(data.get("result") or [])
            total = all_records[0].get("total") if all_records else 0
            print(f"[crewlist_sync] page 1: {len(all_records)} records, total={total}")

            page_num = 2
            offset = page_size
            while len(all_records) < (total or 0) and page_num <= MAX_PAGES:
                body["offset"] = offset
                body["gridServerOperations"]["page"] = page_num
                result = await page.evaluate("""async ({url, headers, body}) => {
                    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
                    const text = await res.text();
                    let json = null;
                    try { json = JSON.parse(text); } catch (e) {}
                    return { status: res.status, json, text: text.slice(0, 1000) };
                }""", {"url": req.url, "headers": headers, "body": body})
                if result["status"] != 200 or not result["json"]:
                    raise RuntimeError(f"Crewlist page {page_num} failed: status={result['status']} {result.get('text')}")
                page_data = result["json"]
                if page_data.get("isError"):
                    raise RuntimeError(f"Crewlist page {page_num} error: {page_data.get('validationMessages')}")
                records = page_data.get("result") or []
                print(f"[crewlist_sync] page {page_num}: {len(records)} records")
                if not records:
                    break
                all_records.extend(records)
                offset += page_size
                page_num += 1

            return all_records
        finally:
            await browser.close()


async def run_sync():
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    log = models.SyncLog(status="failed")
    db.add(log)
    db.commit()

    try:
        records = await fetch_crew()
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
        print(f"[crewlist_sync] fetched={len(records)} created={created} updated={updated} errors={errors}")
    except Exception as e:
        db.rollback()
        log.status = "failed"
        log.error_message = str(e)[:2000]
        print(f"[crewlist_sync] failed: {e}")
    finally:
        log.finished_at = datetime.now(timezone.utc)
        db.commit()
        db.close()


if __name__ == "__main__":
    asyncio.run(run_sync())
