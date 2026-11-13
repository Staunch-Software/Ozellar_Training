import pytest
from datetime import date
from app.models import User, OrientationProgram, OrientationTask, OrientationEnrollment, OrientationTaskCompletion, OrientationSubmission
from app.auth import hash_password

def setup_users(db_session):
    if db_session.query(User).filter_by(id="admin_1").first():
        return
    admin = User(
        id="admin_1", role="admin", full_name="Admin User",
        email="admin@example.com", password_hash=hash_password("password123"), is_active=True
    )
    learner = User(
        id="learner_1", role="learner", full_name="John Doe",
        crew_id="C123", date_of_birth=date(1990, 1, 15), is_active=True,
        current_vessel="TEST VESSEL", rank="THIRD OFFICER"
    )
    approver = User(
        id="approver_1", role="learner", full_name="Jane Master",
        crew_id="M456", date_of_birth=date(1980, 5, 20), rank="MASTER",
        emp_status="SAIL", current_vessel="TEST VESSEL", is_active=True
    )
    db_session.add_all([admin, learner, approver])
    db_session.commit()

@pytest.fixture
def tokens(client, db):
    setup_users(db)
    
    admin_resp = client.post("/api/auth/login", json={"mode": "admin", "email": "admin@example.com", "password": "password123"})
    learner_resp = client.post("/api/auth/login", json={"mode": "crew", "name": "John Doe", "dob": "15011990"})
    approver_resp = client.post("/api/auth/login", json={"mode": "crew", "name": "Jane Master", "dob": "20051980"})
    
    return {
        "admin": admin_resp.json()["token"],
        "learner": learner_resp.json()["token"],
        "approver": approver_resp.json()["token"]
    }

# --- Admin Operations ---

def test_admin_crud_orientation_program(client, db, tokens):
    # Create
    resp = client.post("/api/admin/orientation/programs", headers={"Authorization": f"Bearer {tokens['admin']}"}, json={
        "title": "Engine Cadet Program",
        "department": "engine",
        "description": "Standard induction"
    })
    assert resp.status_code == 200
    prog_id = resp.json()["id"]

    # Update
    resp = client.put(f"/api/admin/orientation/programs/{prog_id}", headers={"Authorization": f"Bearer {tokens['admin']}"}, json={
        "title": "Engine Cadet Program V2",
        "department": "engine"
    })
    assert resp.status_code == 200
    assert resp.json()["title"] == "Engine Cadet Program V2"

    # Toggle active
    resp = client.patch(f"/api/admin/orientation/programs/{prog_id}/toggle", headers={"Authorization": f"Bearer {tokens['admin']}"})
    assert resp.status_code == 200

    # Delete
    resp = client.delete(f"/api/admin/orientation/programs/{prog_id}", headers={"Authorization": f"Bearer {tokens['admin']}"})
    assert resp.status_code == 200
    assert db.get(OrientationProgram, prog_id) is None

def test_admin_crud_orientation_tasks(client, db, tokens):
    # Create program
    p_resp = client.post("/api/admin/orientation/programs", headers={"Authorization": f"Bearer {tokens['admin']}"}, json={
        "title": "Task Test Program", "department": "deck"
    })
    prog_id = p_resp.json()["id"]

    # Add task
    resp = client.post(f"/api/admin/orientation/programs/{prog_id}/tasks", headers={"Authorization": f"Bearer {tokens['admin']}"}, json={
        "title": "Familiarization", "requiresProof": True
    })
    assert resp.status_code == 200
    task_id = resp.json()["id"]

    # Update task
    resp = client.put(f"/api/admin/orientation/programs/{prog_id}/tasks/{task_id}", headers={"Authorization": f"Bearer {tokens['admin']}"}, json={
        "title": "Familiarization Updated", "requiresProof": False
    })
    assert resp.status_code == 200
    assert resp.json()["title"] == "Familiarization Updated"

    # Reorder
    resp = client.put(f"/api/admin/orientation/programs/{prog_id}/reorder", headers={"Authorization": f"Bearer {tokens['admin']}"}, json={
        "order": [task_id]
    })
    assert resp.status_code == 200

    # Delete task
    resp = client.delete(f"/api/admin/orientation/programs/{prog_id}/tasks/{task_id}", headers={"Authorization": f"Bearer {tokens['admin']}"})
    assert resp.status_code == 200
    assert db.get(OrientationTask, task_id) is None

def test_admin_crud_enrollments(client, db, tokens):
    # Create program
    p_resp = client.post("/api/admin/orientation/programs", headers={"Authorization": f"Bearer {tokens['admin']}"}, json={"title": "Enroll Test", "department": "deck"})
    prog_id = p_resp.json()["id"]

    # Enroll
    resp = client.post("/api/admin/orientation/enrollments", headers={"Authorization": f"Bearer {tokens['admin']}"}, json={
        "learnerId": "learner_1", "programId": prog_id, "vesselName": "TEST VESSEL", "targetRanks": []
    })
    assert resp.status_code == 200
    
    enrolls = db.query(OrientationEnrollment).filter_by(learner_id="learner_1", program_id=prog_id).all()
    assert len(enrolls) == 1
    enroll_id = enrolls[0].id

    # Delete Enrollment
    resp = client.delete(f"/api/admin/orientation/enrollments/{enroll_id}", headers={"Authorization": f"Bearer {tokens['admin']}"})
    assert resp.status_code == 200
    assert db.get(OrientationEnrollment, enroll_id) is None


# --- Learner / Approver Flow ---

def setup_program(db_session):
    if db_session.get(OrientationProgram, "prog_1"): return
    prog = OrientationProgram(id="prog_1", title="Deck Cadet to 3rd Off", department="deck")
    task = OrientationTask(id="task_1", program_id="prog_1", title="Lifeboat Drill")
    enroll = OrientationEnrollment(id="enroll_1", program_id="prog_1", learner_id="learner_1", vessel_name="TEST VESSEL", status="in_progress")
    completion = OrientationTaskCompletion(id="comp_1", enrollment_id="enroll_1", task_id="task_1", status="draft", is_completed=True)
    submission = OrientationSubmission(id="sub_1", enrollment_id="enroll_1", vessel_name="TEST VESSEL", department="deck", status="pending")

    db_session.add_all([prog, task, enroll, completion, submission])
    db_session.commit()

def test_learner_submit_task(client, db, tokens):
    setup_program(db)
    
    # Learner submits task
    resp = client.post("/api/orientation/tasks/task_1/submit", headers={"Authorization": f"Bearer {tokens['learner']}"})
    assert resp.status_code == 200

    # Verify DB
    comp = db.query(OrientationTaskCompletion).filter_by(task_id="task_1").first()
    assert comp.status == "pending_review"

def test_approver_verify_task(client, db, tokens):
    setup_program(db)
    
    # First learner submits it so it's pending_review
    comp = db.query(OrientationTaskCompletion).filter_by(task_id="task_1").first()
    comp.status = "pending_review"
    db.commit()
    
    # Approver verifies
    resp = client.post("/api/approver/submissions/enroll_1/tasks/task_1/verify", 
                       headers={"Authorization": f"Bearer {tokens['approver']}"},
                       json={"action": "approve"})
    assert resp.status_code == 200

    # Verify DB
    db.refresh(comp)
    assert comp.verified is True
    assert comp.verified_by == "approver_1"


def test_admin_list_orientation_vessels(client, db, tokens):
    resp = client.get("/api/admin/orientation/vessels", headers={"Authorization": f"Bearer {tokens['admin']}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_admin_list_orientation_candidates(client, db, tokens):
    resp = client.get("/api/admin/orientation/candidates?on_sail=true", headers={"Authorization": f"Bearer {tokens['admin']}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_admin_orientation_programs_xlsx(client, db, tokens):
    resp = client.get("/api/admin/orientation/programs.xlsx", headers={"Authorization": f"Bearer {tokens['admin']}"})
    assert resp.status_code == 200
    assert "spreadsheetml" in resp.headers["content-type"]


def test_admin_orientation_results(client, db, tokens):
    setup_program(db)
    resp = client.get("/api/admin/orientation/results", headers={"Authorization": f"Bearer {tokens['admin']}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_admin_orientation_results_xlsx(client, db, tokens):
    setup_program(db)
    resp = client.get("/api/admin/orientation/results.xlsx", headers={"Authorization": f"Bearer {tokens['admin']}"})
    assert resp.status_code == 200
    assert "spreadsheetml" in resp.headers["content-type"]


def test_learner_my_orientation_enrollment(client, db, tokens):
    setup_program(db)
    resp = client.get("/api/orientation/my-enrollment", headers={"Authorization": f"Bearer {tokens['learner']}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data is not None
    assert data["id"] == "enroll_1"


def test_learner_submit_multiple_tasks(client, db, tokens):
    setup_program(db)
    # Ensure completion is completed
    comp = db.query(OrientationTaskCompletion).filter_by(task_id="task_1").first()
    comp.is_completed = True
    comp.status = "draft"
    db.commit()

    resp = client.post(
        "/api/orientation/tasks/submit-multiple",
        headers={"Authorization": f"Bearer {tokens['learner']}"},
        json={"task_ids": ["task_1"]}
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_admin_programs_enrollments_alias(client, db, tokens):
    setup_program(db)
    resp = client.get(
        "/api/admin/orientation/programs/enrollments",
        headers={"Authorization": f"Bearer {tokens['admin']}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["id"] == "enroll_1"


def test_admin_programs_results_alias(client, db, tokens):
    setup_program(db)
    resp = client.get(
        "/api/admin/orientation/programs/results",
        headers={"Authorization": f"Bearer {tokens['admin']}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


def test_learner_complete_orientation_task(client, db, tokens):
    setup_program(db)
    resp = client.post(
        "/api/orientation/tasks/task_1/complete",
        headers={"Authorization": f"Bearer {tokens['learner']}"},
        data={"completed": "true", "note": "Checked and done"}
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["isCompleted"] is True


def test_learner_delete_task_attachment(client, db, tokens):
    setup_program(db)
    # Add dummy proof path to completion
    comp = db.query(OrientationTaskCompletion).filter_by(task_id="task_1").first()
    comp.proof_paths = ["/api/uploads/orientation_proofs/doc1.pdf"]
    db.commit()

    resp = client.delete(
        "/api/orientation/tasks/task_1/attachments",
        headers={"Authorization": f"Bearer {tokens['learner']}"},
        params={"url": "/api/uploads/orientation_proofs/doc1.pdf"}
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert "/api/uploads/orientation_proofs/doc1.pdf" not in resp.json()["proofUrls"]


def test_admin_get_orientation_enrollment_detail(client, db, tokens):
    setup_program(db)
    # Ensure enrollment exists
    enrollment = db.query(OrientationEnrollment).first()
    assert enrollment is not None

    # Add a task completion with note and proofUrls
    comp = db.query(OrientationTaskCompletion).filter_by(enrollment_id=enrollment.id, task_id="task_1").first()
    if comp:
        comp.is_completed = True
        comp.note = "Officer verified radar operations"
        comp.proof_paths = ["/api/uploads/orientation_proofs/test_evidence.pdf", "/api/uploads/orientation_proofs/sample.png"]
        db.commit()

    resp = client.get(
        f"/api/admin/orientation/enrollments/{enrollment.id}",
        headers={"Authorization": f"Bearer {tokens['admin']}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["enrollmentId"] == enrollment.id
    assert "candidateName" in data
    assert "programTitle" in data
    assert "tasks" in data
    assert len(data["tasks"]) > 0

    # Verify task detail includes notes, attachments, and flags
    task1 = next((t for t in data["tasks"] if t["id"] == "task_1"), None)
    assert task1 is not None
    assert task1["isCompleted"] is True
    assert task1["note"] == "Officer verified radar operations"
    assert len(task1["proofUrls"]) == 2
    assert "completedCount" in data
    assert "attachmentsCount" in data
    assert data["attachmentsCount"] >= 2


def test_admin_get_orientation_enrollment_detail_not_found(client, db, tokens):
    resp = client.get(
        "/api/admin/orientation/enrollments/nonexistent_id",
        headers={"Authorization": f"Bearer {tokens['admin']}"}
    )
    assert resp.status_code == 404


def test_admin_get_orientation_enrollment_detail_unauthorized(client, db, tokens):
    enrollment = db.query(OrientationEnrollment).first()
    if not enrollment:
        setup_program(db)
        enrollment = db.query(OrientationEnrollment).first()

    # Unauthenticated
    resp = client.get(f"/api/admin/orientation/enrollments/{enrollment.id}")
    assert resp.status_code == 401

    # Learner role (not orientation admin)
    resp = client.get(
        f"/api/admin/orientation/enrollments/{enrollment.id}",
        headers={"Authorization": f"Bearer {tokens['learner']}"}
    )
    assert resp.status_code == 403


def test_admin_verify_orientation_task_approve(client, db, tokens):
    setup_program(db)
    enrollment = db.query(OrientationEnrollment).first()
    assert enrollment is not None

    resp = client.post(
        f"/api/admin/orientation/enrollments/{enrollment.id}/tasks/task_1/verify",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={"action": "approve"}
    )
    assert resp.status_code == 200
    data = resp.json()
    task1 = next((t for t in data["tasks"] if t["id"] == "task_1"), None)
    assert task1 is not None
    assert task1["verified"] is True
    assert task1["status"] == "approved"
    assert task1["verifiedBy"] == "Admin User"
    assert task1["verifiedByRole"] == "admin"

    # Verify DB
    comp = db.query(OrientationTaskCompletion).filter_by(enrollment_id=enrollment.id, task_id="task_1").first()
    assert comp.verified is True
    assert comp.status == "approved"
    assert comp.verified_by == "admin_1"


def test_admin_verify_orientation_task_reject(client, db, tokens):
    setup_program(db)
    enrollment = db.query(OrientationEnrollment).first()
    assert enrollment is not None

    resp = client.post(
        f"/api/admin/orientation/enrollments/{enrollment.id}/tasks/task_1/verify",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={"action": "reject", "note": "Please re-upload clearer certificate"}
    )
    assert resp.status_code == 200
    data = resp.json()
    task1 = next((t for t in data["tasks"] if t["id"] == "task_1"), None)
    assert task1 is not None
    assert task1["status"] == "rejected"
    assert task1["rejectionNote"] == "Please re-upload clearer certificate"
    assert task1["verified"] is False

    # Verify DB
    comp = db.query(OrientationTaskCompletion).filter_by(enrollment_id=enrollment.id, task_id="task_1").first()
    assert comp.status == "rejected"
    assert comp.rejection_note == "Please re-upload clearer certificate"


def test_admin_decide_orientation_enrollment(client, db, tokens):
    setup_program(db)
    enrollment = db.query(OrientationEnrollment).first()
    assert enrollment is not None

    # First verify task so enrollment can advance to master_approved
    client.post(
        f"/api/admin/orientation/enrollments/{enrollment.id}/tasks/task_1/verify",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={"action": "approve"}
    )
    db.refresh(enrollment)
    assert enrollment.status == "master_approved"

    # Admin gives final approval
    resp = client.post(
        f"/api/admin/orientation/enrollments/{enrollment.id}/decide",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={"action": "approve"}
    )
    assert resp.status_code == 200
    db.refresh(enrollment)
    assert enrollment.status == "approved"


def test_admin_cannot_modify_or_reject_after_final_approval(client, db, tokens):
    setup_program(db)
    enrollment = db.query(OrientationEnrollment).first()
    assert enrollment is not None

    # Approve task and give final approval
    client.post(
        f"/api/admin/orientation/enrollments/{enrollment.id}/tasks/task_1/verify",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={"action": "approve"}
    )
    client.post(
        f"/api/admin/orientation/enrollments/{enrollment.id}/decide",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={"action": "approve"}
    )
    db.refresh(enrollment)
    assert enrollment.status == "approved"

    # Attempt to reject task after final approval -> MUST FAIL (400)
    resp = client.post(
        f"/api/admin/orientation/enrollments/{enrollment.id}/tasks/task_1/verify",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={"action": "reject", "note": "Late rejection"}
    )
    assert resp.status_code == 400
    assert "already fully approved" in resp.json()["detail"]

    # Attempt to decide enrollment after final approval -> MUST FAIL (400)
    resp_decide = client.post(
        f"/api/admin/orientation/enrollments/{enrollment.id}/decide",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={"action": "reject", "reason": "Late rejection"}
    )
    assert resp_decide.status_code == 400
    assert "already fully approved" in resp_decide.json()["detail"]


def test_admin_cannot_final_approve_if_tasks_not_all_approved(client, db, tokens):
    setup_program(db)
    enrollment = db.query(OrientationEnrollment).first()
    assert enrollment is not None

    # Set enrollment to master_approved without approving task_1
    enrollment.status = "master_approved"
    db.commit()

    # Attempt to final approve -> MUST FAIL (400) because task_1 is not approved
    resp = client.post(
        f"/api/admin/orientation/enrollments/{enrollment.id}/decide",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={"action": "approve"}
    )
    assert resp.status_code == 400
    assert "All tasks must be approved" in resp.json()["detail"]






