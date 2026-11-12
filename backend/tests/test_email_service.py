import os
from unittest.mock import patch
import pytest
from datetime import date
from app import email_service, models
from app.main import send_pending_digest_job


def test_get_admin_recipients_unset(monkeypatch):
    monkeypatch.delenv("APPROVER_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)
    assert email_service.get_admin_recipients() == []


def test_get_approver_recipients_and_cc(monkeypatch):
    monkeypatch.setenv("APPROVER_EMAIL", "approver@ozellar.com")
    monkeypatch.setenv("APPROVER_CC", "shweta.s@ozellar.com, auditor@ozellar.com")
    assert email_service.get_admin_recipients() == ["approver@ozellar.com"]
    assert email_service.get_approver_cc_recipients() == ["shweta.s@ozellar.com", "auditor@ozellar.com"]


def test_get_admin_recipients_single(monkeypatch):
    monkeypatch.delenv("APPROVER_EMAIL", raising=False)
    monkeypatch.setenv("ADMIN_EMAIL", "admin@ozellar.com")
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)
    assert email_service.get_admin_recipients() == ["admin@ozellar.com"]


def test_get_admin_recipients_comma_separated(monkeypatch):
    monkeypatch.delenv("APPROVER_EMAIL", raising=False)
    monkeypatch.setenv("ADMIN_EMAIL", " admin1@ozellar.com , admin2@ozellar.com ,admin3@ozellar.com ")
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)
    assert email_service.get_admin_recipients() == [
        "admin1@ozellar.com",
        "admin2@ozellar.com",
        "admin3@ozellar.com",
    ]


def test_get_admin_recipients_semicolon_and_duplicates(monkeypatch):
    monkeypatch.delenv("APPROVER_EMAIL", raising=False)
    monkeypatch.setenv("ADMIN_EMAIL", "admin1@ozellar.com; admin2@ozellar.com ; admin1@ozellar.com")
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)
    assert email_service.get_admin_recipients() == [
        "admin1@ozellar.com",
        "admin2@ozellar.com",
    ]


def test_get_admin_recipients_both_env_vars(monkeypatch):
    monkeypatch.delenv("APPROVER_EMAIL", raising=False)
    monkeypatch.setenv("ADMIN_EMAIL", "email1@ozellar.com, email2@ozellar.com")
    monkeypatch.setenv("ADMIN_EMAILS", "email2@ozellar.com; email3@ozellar.com")
    assert email_service.get_admin_recipients() == [
        "email1@ozellar.com",
        "email2@ozellar.com",
        "email3@ozellar.com",
    ]


def test_send_digest_email_empty_approvals():
    with patch.object(email_service, "_send_email") as mock_send:
        email_service.send_digest_email("admin@ozellar.com", [])
        mock_send.assert_not_called()


def test_send_digest_email_multiple_recipients():
    approvals = [{
        "learner_name": "Test Cadet",
        "crew_id": "C999",
        "rank": "Cadet",
        "status": "Onboard",
        "vessel": "AMNSI Stallion",
        "mobile_no": "9876543210",
        "course_title": "Safety at Sea",
        "score": 95,
        "token": "mock-token-xyz"
    }]
    with patch.object(email_service, "_send_email") as mock_send:
        email_service.send_digest_email("admin1@ozellar.com, admin2@ozellar.com", approvals)
        assert mock_send.call_count == 1
        call_kwargs = mock_send.call_args.kwargs
        to_email = call_kwargs.get("to_email") or mock_send.call_args[0][0]
        cc_emails = call_kwargs.get("cc_emails")
        assert to_email == "admin1@ozellar.com"
        assert "admin2@ozellar.com" in cc_emails
        # Subject check
        subject = call_kwargs.get("subject") or mock_send.call_args[0][1]
        assert subject == "Pending Assessment Approvals (1)"
        # HTML body check
        html = call_kwargs.get("html_content") or mock_send.call_args[0][2]
        assert "Test Cadet" in html
        assert "Safety at Sea" in html
        assert "95%" in html
        assert "mock-token-xyz" in html
        assert "Status / Vessel" in html
        assert "ONBOARD" in html
        assert "AMNSI Stallion" in html


def test_send_digest_email_default_cc_shweta():
    approvals = [{
        "learner_name": "Test Cadet",
        "crew_id": "C999",
        "rank": "Cadet",
        "status": "Onboard",
        "vessel": "AMNSI Stallion",
        "course_title": "Safety at Sea",
        "score": 95,
        "token": "mock-token-xyz"
    }]
    with patch.object(email_service, "_send_email") as mock_send:
        email_service.send_digest_email("sudarsan.s@ozellar.com", approvals)
        assert mock_send.call_count == 1
        call_kwargs = mock_send.call_args.kwargs
        to_email = call_kwargs.get("to_email") or mock_send.call_args[0][0]
        cc_emails = call_kwargs.get("cc_emails")
        assert to_email == "sudarsan.s@ozellar.com"
        assert "shweta.s@ozellar.com" in cc_emails


def test_send_digest_email_leave_and_fallback():
    approvals = [
        {
            "learner_name": "Leave Sailor",
            "crew_id": "C101",
            "rank": "Oiler",
            "status": "Leave",
            "vessel": None,
            "mobile_no": "1234567890",
            "course_title": "Basic First Aid",
            "score": 90,
            "token": "tok-leave",
        },
        {
            "learner_name": "Onboard Sailor No Vessel",
            "crew_id": "C102",
            "rank": "Bosun",
            "status": "Onboard",
            "vessel": None,
            "mobile_no": "1234567891",
            "course_title": "Enclosed Space Entry",
            "score": 85,
            "token": "tok-onboard-novsl",
        },
    ]
    with patch.object(email_service, "_send_email") as mock_send:
        email_service.send_digest_email("admin@ozellar.com", approvals)
        mock_send.assert_called_once()
        html = mock_send.call_args.kwargs.get("html_content") or mock_send.call_args[0][2]
        assert "Status / Vessel" in html
        assert "LEAVE" in html
        assert "ONBOARD" in html
        assert "Basic First Aid" in html
        assert "Enclosed Space Entry" in html


def test_send_digest_email_list_input():
    approvals = [{
        "learner_name": "Test Officer",
        "crew_id": "C888",
        "rank": "Officer",
        "status": "Leave",
        "vessel": None,
        "mobile_no": None,
        "course_title": "Navigation 101",
        "score": 88,
        "token": "tok123"
    }]
    with patch.object(email_service, "_send_email") as mock_send:
        email_service.send_digest_email(["one@ozellar.com", "two@ozellar.com"], approvals)
        assert mock_send.call_count == 1
        call_kwargs = mock_send.call_args.kwargs
        to_email = call_kwargs.get("to_email") or mock_send.call_args[0][0]
        cc_emails = call_kwargs.get("cc_emails")
        assert to_email == "one@ozellar.com"
        assert "two@ozellar.com" in cc_emails


def test_send_pending_digest_job_dispatch(db, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", "lead@ozellar.com, manager@ozellar.com")
    
    # Create test users (one sailing onboard, one on leave) and course
    user_sail = models.User(
        id="digest_user_sail", role="learner", full_name="Sailing Learner",
        crew_id="CSAIL1", date_of_birth=date(1995, 5, 20), is_active=True,
        emp_status="SAIL", current_vessel="AMNSI Stallion"
    )
    user_leave = models.User(
        id="digest_user_leave", role="learner", full_name="Leave Learner",
        crew_id="CLEAVE1", date_of_birth=date(1992, 3, 15), is_active=True,
        emp_status="LEAVE", current_vessel="AMNSI Stallion"
    )
    course = models.Course(
        id="digest_course_1", slug="digest-course", title="Digest Course", pass_mark=70
    )
    db.add_all([user_sail, user_leave, course])
    db.commit()

    # Create pending approvals
    ap1 = models.AssessmentApproval(
        learner_id=user_sail.id,
        course_id=course.id,
        score=85,
        status="pending",
        digest_sent=False
    )
    ap2 = models.AssessmentApproval(
        learner_id=user_leave.id,
        course_id=course.id,
        score=90,
        status="pending",
        digest_sent=False
    )
    db.add_all([ap1, ap2])
    db.commit()

    sent_recipients = []
    sent_ccs = []
    captured_approvals = []
    def fake_send_digest(admin_email, approvals, cc_emails=None):
        if isinstance(admin_email, list):
            sent_recipients.extend(admin_email)
        else:
            sent_recipients.append(admin_email)
        if cc_emails:
            sent_ccs.extend(cc_emails)
        captured_approvals.extend(approvals)

    class MockSessionContext:
        def __enter__(self):
            return db
        def __exit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("app.main.SessionLocal", side_effect=MockSessionContext):
        with patch.object(email_service, "send_digest_email", side_effect=fake_send_digest):
            send_pending_digest_job()

    assert "lead@ozellar.com" in sent_recipients
    assert "manager@ozellar.com" in sent_ccs

    # Check status and vessel logic
    sail_ap = next(a for a in captured_approvals if a["crew_id"] == "CSAIL1")
    assert sail_ap["status"] == "Onboard"
    assert sail_ap["vessel"] == "AMNSI Stallion"

    leave_ap = next(a for a in captured_approvals if a["crew_id"] == "CLEAVE1")
    assert leave_ap["status"] == "Leave"
    assert leave_ap["vessel"] is None

    # Check that approvals were marked digest_sent=True
    db.refresh(ap1)
    db.refresh(ap2)
    assert ap1.digest_sent is True
    assert ap1.approval_token is not None
    assert ap2.digest_sent is True
    assert ap2.approval_token is not None


def test_approve_remark_form_page_status_vessel():
    from app.routers.assessments import _approve_remark_form_page
    u_onboard = models.User(
        id="u_onb", role="learner", full_name="Captain Jack",
        crew_id="C900", rank="Master", emp_status="SAIL", current_vessel="AMNSI Lion"
    )
    u_leave = models.User(
        id="u_lv", role="learner", full_name="Officer Jane",
        crew_id="C901", rank="Chief Officer", emp_status="LEAVE", current_vessel="AMNSI Lion"
    )
    course = models.Course(id="c_nav", slug="c-nav", title="Advanced Navigation", pass_mark=75)
    ap = models.AssessmentApproval(id=1, learner_id=u_onboard.id, course_id=course.id, score=92)

    resp_onboard = _approve_remark_form_page(ap, u_onboard, course, token="tok1")
    html_onboard = resp_onboard.body.decode("utf-8")
    assert "Status / Vessel" in html_onboard
    assert "Onboard (AMNSI Lion)" in html_onboard

    resp_leave = _approve_remark_form_page(ap, u_leave, course, token="tok2")
    html_leave = resp_leave.body.decode("utf-8")
    assert "Status / Vessel" in html_leave
    assert "Leave" in html_leave


def test_send_course_reminder_email():
    with patch.object(email_service, "_send_email", return_value=True) as mock_send:
        # 1. No email -> returns False, doesn't send
        assert email_service.send_course_reminder_email("", "John Doe") is False
        assert email_service.send_course_reminder_email(None, "John Doe") is False
        mock_send.assert_not_called()

        # 2. Valid email with pending courses
        res = email_service.send_course_reminder_email(
            "seafarer@example.com",
            "John Doe",
            ["Engine Room Safety", "Bridge Resource Management"]
        )
        assert res is True
        mock_send.assert_called_once()
        kwargs = mock_send.call_args.kwargs
        to_email = kwargs.get("to_email") or mock_send.call_args[0][0]
        subject = kwargs.get("subject") or mock_send.call_args[0][1]
        html = kwargs.get("html_content") or mock_send.call_args[0][2]
        from_email = kwargs.get("from_email")
        cc_emails = kwargs.get("cc_emails")
        assert to_email == "seafarer@example.com"
        assert from_email == "data@ozellar.com"
        assert "Complete Your Assigned Courses" in subject
        assert "Good day" in html
        # Best regards and Sudarsan sign-off removed
        html_lower = html.lower()
        assert "best regards" not in html_lower
        # Support email updated to techdevops@ozellar.com
        assert "techdevops@ozellar.com" in html
        # Default test notification line removed from footer
        assert "automated training notification sent from" not in html_lower
        # Green & Orange theme verified
        assert "#064e3b" in html or "#059669" in html
        assert "#E07820" in html or "#ea580c" in html or "#f97316" in html
        assert "https://training.ozellar.com" in html
        assert "Engine Room Safety" in html
        assert "Bridge Resource Management" in html
        assert "access" in html_lower
        assert "seafarer" in html_lower
        assert "passport size photo" in html_lower
        assert "complete the assigned courses" in html_lower
        # CC verified
        assert "sudarsan.s@ozellar.com" in cc_emails
        assert "shweta.s@ozellar.com" in cc_emails


def test_send_email_graph_api_cc_payload():
    with patch.object(email_service, "_get_access_token", return_value="mock-token"):
        with patch("requests.post") as mock_post:
            mock_post.return_value.status_code = 202
            mock_post.return_value.raise_for_status = lambda: None

            ok = email_service._send_email(
                to_email="candidate@example.com",
                subject="Test Subject",
                html_content="<p>Test Content</p>",
                from_email="data@ozellar.com",
                cc_emails=["sudarsan.s@ozellar.com", "shweta.s@ozellar.com", "candidate@example.com"]
            )
            assert ok is True
            mock_post.assert_called_once()
            json_body = mock_post.call_args.kwargs["json"]
            message = json_body["message"]
            assert message["toRecipients"] == [{"emailAddress": {"address": "candidate@example.com"}}]
            # candidate@example.com is deduplicated from CC since it's the primary recipient
            assert message["ccRecipients"] == [
                {"emailAddress": {"address": "sudarsan.s@ozellar.com"}},
                {"emailAddress": {"address": "shweta.s@ozellar.com"}},
            ]


def test_send_approval_email_cc_and_no_best_regards():
    with patch.object(email_service, "_send_email", return_value=True) as mock_send:
        email_service.send_approval_email(
            crew_email="sailor@ozellar.com",
            crew_name="Sailor Boy",
            course_title="Sea Survival",
            cert_pdf=b"%PDF-1.4",
            cert_id="CERT123"
        )
        mock_send.assert_called_once()
        kwargs = mock_send.call_args.kwargs
        html = kwargs.get("html_content") or mock_send.call_args[0][2]
        cc_emails = kwargs.get("cc_emails")
        assert "best regards" not in html.lower()
        assert "sudarsan.s@ozellar.com" in cc_emails
        assert "shweta.s@ozellar.com" in cc_emails


def test_send_course_reminder_batch():
    targets = [
        {"email": "crew1@ozellar.com", "name": "Crew One", "pending_courses": ["Course 1"]},
        {"email": "crew2@ozellar.com", "name": "Crew Two", "pending_courses": ["Course 2"]},
        {"email": "", "name": "No Email Crew", "pending_courses": ["Course 3"]},
    ]
    with patch.object(email_service, "send_course_reminder_email", return_value=True) as mock_send:
        count = email_service.send_course_reminder_batch(targets, from_email="data@ozellar.com")
        assert count == 2
        assert mock_send.call_count == 2
        first_call = mock_send.call_args_list[0]
        # send_course_reminder_email(email, name, courses, from_email=from_email)
        assert first_call.args[0] == "crew1@ozellar.com"
        assert first_call.kwargs.get("from_email") == "data@ozellar.com"


def test_auto_email_on_bulk_enrollment(client, db):
    """Verifies that assigning new courses via admin_bulk_set_enrollments triggers email automatically."""
    from app.auth import create_token
    admin = models.User(
        id="admin_test_auto",
        role="admin",
        full_name="Admin Auto",
        email="admin_auto@ozellar.com",
        is_active=True
    )
    learner = models.User(
        id="learner_auto_mail",
        role="learner",
        full_name="Auto Seafarer",
        crew_id="C7777",
        smartpal_email="seafarer_auto@example.com",
        is_active=True
    )
    course = models.Course(
        id="c_auto_test",
        slug="c-auto-test",
        title="Automated Fire Safety",
        pass_mark=80,
        max_attempts=3
    )
    db.merge(admin)
    db.merge(learner)
    db.merge(course)
    db.commit()

    tok = create_token(admin)

    with patch.object(email_service, "send_course_reminder_email", return_value=True) as mock_send:
        res = client.put(
            f"/api/admin/users/{learner.id}/enrollments",
            json={"courseIds": ["c_auto_test"]},
            headers={"Authorization": f"Bearer {tok}"}
        )
        assert res.status_code == 200
        assert res.json()["ok"] is True
        assert res.json()["added"] == 1
        mock_send.assert_called_once()
        kwargs = mock_send.call_args.kwargs
        assert kwargs.get("crew_email") == "seafarer_auto@example.com"
        assert "Automated Fire Safety" in kwargs.get("pending_courses")
        assert kwargs.get("from_email") == "data@ozellar.com"


def test_auto_email_on_course_creation_with_target_ranks(client, db):
    """Verifies that creating a course targeted at specific ranks automatically notifies crew in that rank."""
    from app.auth import create_token
    admin = models.User(
        id="admin_test_create_auto",
        role="super_admin",
        full_name="Super Admin Auto",
        email="super_auto@ozellar.com",
        is_active=True
    )
    chief_eng = models.User(
        id="chief_eng_crew",
        role="learner",
        full_name="Chief Engineer Crew",
        crew_id="C5555",
        rank="CHIEF ENGINEER",
        smartpal_email="chief@engine.com",
        is_active=True
    )
    db.merge(admin)
    db.merge(chief_eng)
    db.commit()

    tok = create_token(admin)

    with patch.object(email_service, "send_course_reminder_batch", return_value=1) as mock_batch:
        res = client.post(
            "/api/admin/courses",
            json={
                "title": "High Voltage Safety Course",
                "targetRanks": ["CHIEF ENGINEER"]
            },
            headers={"Authorization": f"Bearer {tok}"}
        )
        assert res.status_code == 200
        mock_batch.assert_called_once()
        batch_targets = mock_batch.call_args[0][0]
        assert len(batch_targets) >= 1
        target_emails = [t["email"] for t in batch_targets]
        assert "chief@engine.com" in target_emails
        assert mock_batch.call_args.kwargs.get("from_email") == "data@ozellar.com"


