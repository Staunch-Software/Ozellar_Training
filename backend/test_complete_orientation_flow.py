"""
End-to-end integration test verifying the complete Orientation workflow:
1. Candidate enrollment with tasks
2. Candidate completes tasks & submits for review (notifies Master/CE)
3. Master/CE reviews & approves tasks -> signs off enrollment (notifies Admin)
4. Admin reviews -> rejects a task with remark & corrective action
   - Task status becomes 'rejected' with remark
   - Enrollment status reverts to 'in_progress'
   - Seafarer gets notification with remark
   - Master/CE gets notification of admin rejection
5. Seafarer views revision alert, updates task & re-submits (notifies Master/CE)
6. Master/CE verifies re-submitted task & signs off enrollment (notifies Admin)
7. Admin grants Final Approval (notifies Seafarer with promotion clearance & notifies Master/CE)
"""

import sys
import os
from datetime import datetime, timezone

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.database import SessionLocal
from app import models
from app.routers import orientation
from app.notifications_service import notify
from app.auth import hash_password

def test_full_orientation_flow():
    db = SessionLocal()
    print("=" * 70)
    print("STARTING COMPLETE ORIENTATION LIFECYCLE VERIFICATION")
    print("=" * 70)

    try:
        # 1. Setup Users: Admin, Master/CE, Seafarer
        admin = db.query(models.User).filter_by(email="admin@ozellarmarine.com").first()
        if not admin:
            admin = models.User(
                email="admin@ozellarmarine.com",
                full_name="Fleet Admin",
                role="admin",
                is_active=True
            )
            admin.password_hash = hash_password("Admin@123")
            db.add(admin)
            db.commit()

        vessel_name = "MT Ozellar Pioneer"
        master = db.query(models.User).filter_by(email="master.test@ozellarmarine.com").first()
        if not master:
            master = models.User(
                email="master.test@ozellarmarine.com",
                full_name="Capt. Rajesh Kumar",
                role="learner",
                rank="MASTER",
                emp_status="SAIL",
                current_vessel=vessel_name,
                is_active=True
            )
            master.password_hash = hash_password("Master@123")
            db.add(master)
            db.commit()
        else:
            master.role = "learner"
            master.rank = "MASTER"
            master.emp_status = "SAIL"
            master.current_vessel = vessel_name
            db.commit()

        seafarer = db.query(models.User).filter_by(email="cadet.test@ozellarmarine.com").first()
        if not seafarer:
            seafarer = models.User(
                email="cadet.test@ozellarmarine.com",
                full_name="Rohan Sharma",
                role="learner",
                rank="DECK CADET",
                emp_status="SAIL",
                current_vessel=vessel_name,
                is_active=True
            )
            seafarer.password_hash = hash_password("Crew@123")
            db.add(seafarer)
            db.commit()
        else:
            seafarer.role = "learner"
            seafarer.rank = "DECK CADET"
            seafarer.emp_status = "SAIL"
            seafarer.current_vessel = vessel_name
            db.commit()

        print(f" [1/7] Users confirmed: Admin ({admin.full_name}), Master ({master.full_name}), Seafarer ({seafarer.full_name})")

        # 2. Setup Program & Tasks
        program = db.query(models.OrientationProgram).filter_by(title="Deck Cadet to Third Officer Flow Test").first()
        if not program:
            program = models.OrientationProgram(
                title="Deck Cadet to Third Officer Flow Test",
                department="deck",
                from_rank="Deck Cadet",
                to_rank="Third Officer",
                subtitle="End-to-End Promotion Checklist for testing",
                order=99
            )
            db.add(program)
            db.commit()
            db.refresh(program)

        # Ensure 2 tasks exist
        task1 = db.query(models.OrientationTask).filter_by(program_id=program.id, title="ECDIS Operation & Checklists").first()
        if not task1:
            task1 = models.OrientationTask(
                program_id=program.id,
                title="ECDIS Operation & Checklists",
                description="Familiarize with bridge ECDIS system and upload checklist",
                requires_proof=True,
                order=1
            )
            db.add(task1)
            db.commit()
            db.refresh(task1)

        task2 = db.query(models.OrientationTask).filter_by(program_id=program.id, title="Bridge Watchkeeping Familiarization").first()
        if not task2:
            task2 = models.OrientationTask(
                program_id=program.id,
                title="Bridge Watchkeeping Familiarization",
                description="Log 20 hours under supervision of Chief Officer",
                requires_proof=False,
                order=2
            )
            db.add(task2)
            db.commit()
            db.refresh(task2)

        print(f" [2/7] Program & 2 Tasks confirmed: '{task1.title}' & '{task2.title}'")

        # 3. Create or Reset Enrollment
        enrollment = db.query(models.OrientationEnrollment).filter_by(learner_id=seafarer.id, program_id=program.id).first()
        if enrollment:
            # Delete old completions and enrollment for fresh test
            db.query(models.OrientationTaskCompletion).filter_by(enrollment_id=enrollment.id).delete()
            db.delete(enrollment)
            db.commit()

        enrollment = models.OrientationEnrollment(
            learner_id=seafarer.id,
            program_id=program.id,
            vessel_name=vessel_name,
            master_name=master.full_name,
            status="in_progress"
        )
        db.add(enrollment)
        db.commit()
        db.refresh(enrollment)

        print(f" [3/7] Created Enrollment #{enrollment.id} with status '{enrollment.status}'")

        # 4. Seafarer completes tasks and submits
        c1 = models.OrientationTaskCompletion(
            enrollment_id=enrollment.id,
            task_id=task1.id,
            is_completed=True,
            proof_paths=["/uploads/orientation/sample_ecdis_checklist.pdf"],
            note="Completed ECDIS familiarization with 2nd Officer.",
            completed_at=datetime.now(timezone.utc)
        )
        c2 = models.OrientationTaskCompletion(
            enrollment_id=enrollment.id,
            task_id=task2.id,
            is_completed=True,
            proof_paths=[],
            note="Completed 20 hours supervised watchkeeping.",
            completed_at=datetime.now(timezone.utc)
        )
        db.add_all([c1, c2])
        db.commit()

        # Submit task 1
        res1 = orientation.submit_orientation_task(task1.id, user=seafarer, db=db)
        # Submit task 2
        res2 = orientation.submit_orientation_task(task2.id, user=seafarer, db=db)
        db.refresh(c1)
        db.refresh(c2)

        assert c1.status == "pending_review", f"Expected pending_review, got {c1.status}"
        assert c2.status == "pending_review", f"Expected pending_review, got {c2.status}"

        # Check Master notification
        m_notifs = db.query(models.Notification).filter_by(user_id=master.id).order_by(models.Notification.created_at.desc()).limit(2).all()
        assert len(m_notifs) >= 1, "Master should have received submission notifications"
        assert "submitted" in m_notifs[0].title.lower() or "submitted" in m_notifs[0].body.lower()
        print(f" [4/7] Seafarer submitted tasks -> Master notified: '{m_notifs[0].title}'")

        # 5. Master/CE verifies both tasks and approves enrollment
        req_approve = orientation.OrientationVerifyTaskRequest(action="approve")
        orientation.approver_verify_task(enrollment.id, task1.id, req_approve, approver=master, db=db)
        orientation.approver_verify_task(enrollment.id, task2.id, req_approve, approver=master, db=db)

        db.refresh(c1)
        db.refresh(c2)
        assert c1.status == "approved" and c1.verified == True
        assert c2.status == "approved" and c2.verified == True

        # Master signs off submission
        decide_req = orientation.OrientationDecideRequest(action="approve")
        orientation.approver_decide_submission(enrollment.id, decide_req, approver=master, db=db)
        db.refresh(enrollment)
        assert enrollment.status == "master_approved", f"Expected master_approved, got {enrollment.status}"

        # Check Admin was notified
        admin_notifs = db.query(models.Notification).filter_by(user_id=admin.id).order_by(models.Notification.created_at.desc()).first()
        assert admin_notifs is not None
        assert "awaiting" in admin_notifs.title.lower() or "approved" in admin_notifs.body.lower()
        print(f" [5/7] Master verified all tasks & approved submission -> Admin notified: '{admin_notifs.title}'")

        # 6. Admin REJECTS Task 1 with dedicated rejection remark
        rejection_remark = "ECDIS checklist scan is blurry and missing Chief Officer endorsement stamp. Please upload a clear scan."
        req_reject = orientation.OrientationVerifyTaskRequest(action="reject", note=rejection_remark)
        orientation.admin_verify_orientation_task(enrollment.id, task1.id, req_reject, admin=admin, db=db)

        db.refresh(c1)
        db.refresh(enrollment)

        # Verify task 1 is rejected and remark saved
        assert c1.status == "rejected", f"Expected rejected, got {c1.status}"
        assert c1.rejection_note == rejection_remark
        assert c1.verified == False

        # Verify enrollment status reverted to in_progress
        assert enrollment.status == "in_progress", f"Expected in_progress after rejection, got {enrollment.status}"

        # Verify Seafarer got notification with rejection remark
        s_notif = db.query(models.Notification).filter_by(user_id=seafarer.id).order_by(models.Notification.created_at.desc()).first()
        assert s_notif is not None
        assert "Revision Required" in s_notif.title
        assert rejection_remark in s_notif.body
        assert s_notif.link == "/orientation"

        # Verify Master/CE got notification about admin revision request
        m_notif_reject = db.query(models.Notification).filter_by(user_id=master.id).order_by(models.Notification.created_at.desc()).first()
        assert m_notif_reject is not None
        assert "Revision Requested" in m_notif_reject.title
        assert rejection_remark in m_notif_reject.body

        print(f" [6/7] Admin rejected Task #1 with remark:")
        print(f"       -> Remark: '{rejection_remark}'")
        print(f"       -> Enrollment reverted to '{enrollment.status}'")
        print(f"       -> Seafarer notified: '{s_notif.title}'")
        print(f"       -> Master notified: '{m_notif_reject.title}'")

        # 7. Seafarer updates attachment & re-submits Task 1
        c1.proof_paths = ["/uploads/orientation/clear_ecdis_signed_checklist.pdf"]
        c1.note = "Re-uploaded clear high-resolution scan with Chief Officer signature and vessel stamp."
        db.commit()

        orientation.submit_orientation_task(task1.id, user=seafarer, db=db)
        db.refresh(c1)
        assert c1.status == "pending_review"
        assert c1.rejection_note is None

        # Master re-verifies Task 1
        orientation.approver_verify_task(enrollment.id, task1.id, req_approve, approver=master, db=db)
        db.refresh(c1)
        assert c1.status == "approved" and c1.verified == True

        # Master signs off enrollment
        orientation.approver_decide_submission(enrollment.id, decide_req, approver=master, db=db)
        db.refresh(enrollment)
        assert enrollment.status == "master_approved"

        # Admin performs FINAL APPROVAL
        admin_final_req = orientation.AdminOrientationDecideRequest(action="approve")
        orientation.admin_decide_orientation_enrollment(enrollment.id, admin_final_req, admin=admin, db=db)
        db.refresh(enrollment)
        assert enrollment.status == "approved", f"Expected approved, got {enrollment.status}"

        # Verify Seafarer promotion celebration notification
        final_s_notif = db.query(models.Notification).filter_by(user_id=seafarer.id).order_by(models.Notification.created_at.desc()).first()
        assert "Fully Approved" in final_s_notif.title
        assert "cleared for promotion" in final_s_notif.body

        # Verify Master confirmation notification
        final_m_notif = db.query(models.Notification).filter_by(user_id=master.id).order_by(models.Notification.created_at.desc()).first()
        assert "Approved" in final_m_notif.title

        print(f" [7/7] Complete cycle successful:")
        print(f"       -> Seafarer re-submitted task -> Master approved -> Admin final approved")
        print(f"       -> Final Enrollment Status: '{enrollment.status}'")
        print(f"       -> Final Seafarer Notification: '{final_s_notif.title}' - '{final_s_notif.body}'")
        print(f"       -> Final Master Notification: '{final_m_notif.title}'")

        print("=" * 70)
        print("ALL FLOW TEST PASSED PERFECTLY (100% SUCCESS)!")
        print("=" * 70)
        return True

    finally:
        db.close()

if __name__ == "__main__":
    success = test_full_orientation_flow()
    sys.exit(0 if success else 1)
