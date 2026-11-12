import os
import re
import requests
import msal
import base64

# Graph API Credentials
TENANT_ID = os.getenv("AZURE_TENANT_ID")
CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
# The default mailbox for approvals, certificates, digests (existing sender):
SMTP_USER = os.getenv("SMTP_USER", "techdevops@ozellar.com")
# Dedicated separate sender for course assignment & reminder emails:
COURSE_REMINDER_SENDER = os.getenv("COURSE_REMINDER_SENDER", "data@ozellar.com")
# CC recipients for course completion reminder emails:
COURSE_REMINDER_CC_RAW = os.getenv("COURSE_REMINDER_CC", "sudarsan.s@ozellar.com, shweta.s@ozellar.com")
DEFAULT_COURSE_REMINDER_CC = [
    c.strip() for c in re.split(r"[,;]", COURSE_REMINDER_CC_RAW) if c.strip()
]
# CC recipients for pending approval digest emails:
APPROVAL_DIGEST_CC_RAW = os.getenv("APPROVER_CC") or os.getenv("APPROVAL_DIGEST_CC") or "shweta.s@ozellar.com"
DEFAULT_APPROVAL_DIGEST_CC = [
    c.strip() for c in re.split(r"[,;]", APPROVAL_DIGEST_CC_RAW) if c.strip()
]
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://training.ozellar.com")
PRODUCTION_PORTAL_URL = "https://training.ozellar.com"


def _get_access_token():
    if not (TENANT_ID and CLIENT_ID and CLIENT_SECRET):
        return None
    
    authority = f"https://login.microsoftonline.com/{TENANT_ID}"
    app = msal.ConfidentialClientApplication(
        CLIENT_ID, authority=authority, client_credential=CLIENT_SECRET
    )
    
    result = app.acquire_token_silent(["https://graph.microsoft.com/.default"], account=None)
    if not result:
        result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
        
    if "access_token" in result:
        return result["access_token"]
    else:
        print(f"[email_service] Error acquiring token: {result.get('error')} - {result.get('error_description')}")
        return None


def _send_email(
    to_email: str,
    subject: str,
    html_content: str,
    attachment=None,
    from_email: str = None,
    cc_emails: list[str] | str | None = None
) -> bool:
    token = _get_access_token()
    if not token:
        print(f"[email_service] Email sending skipped (missing Graph API credentials or token error). To: {to_email}")
        return False

    sender = from_email or SMTP_USER or "data@ozellar.com"
    endpoint = f"https://graph.microsoft.com/v1.0/users/{sender}/sendMail"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    message = {
        "subject": subject,
        "body": {
            "contentType": "HTML",
            "content": html_content
        },
        "toRecipients": [
            {
                "emailAddress": {
                    "address": to_email
                }
            }
        ],
        "attachments": []
    }

    if cc_emails:
        if isinstance(cc_emails, str):
            raw_ccs = re.split(r"[,;]", cc_emails)
        else:
            raw_ccs = cc_emails
        to_lower = to_email.strip().lower()
        valid_ccs = []
        for cc in raw_ccs:
            cleaned = (cc or "").strip()
            if cleaned and cleaned.lower() != to_lower and cleaned not in valid_ccs:
                valid_ccs.append(cleaned)
        if valid_ccs:
            message["ccRecipients"] = [
                {"emailAddress": {"address": cc}}
                for cc in valid_ccs
            ]
    
    if attachment:
        filename, content_bytes = attachment
        b64_content = base64.b64encode(content_bytes).decode("utf-8")
        message["attachments"].append({
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": filename,
            "contentBytes": b64_content
        })
        
    payload = {
        "message": message,
        "saveToSentItems": "false"
    }
    
    try:
        response = requests.post(endpoint, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        print(f"[email_service] Sent email from {sender} to {to_email} via Graph API")
        return True
    except requests.exceptions.HTTPError as e:
        print(f"[email_service] Graph API Error sending email from {sender} to {to_email}: {e.response.text}")
        return False
    except Exception as e:
        print(f"[email_service] Error sending email from {sender} to {to_email}: {e}")
        return False


def _format_mobile(mobile_no):
    """Groups a clean 10-digit mobile_number as 'XXXXX XXXXX' for readability;
    passes through anything else unchanged (e.g. None, or a legacy unformatted
    value from before the smartpal_sync normalization)."""
    if mobile_no and len(mobile_no) == 10 and mobile_no.isdigit():
        return f"{mobile_no[:5]} {mobile_no[5:]}"
    return mobile_no


def get_admin_recipients() -> list[str]:
    """Returns a list of clean, unique email addresses configured in APPROVER_EMAIL, or fallback ADMIN_EMAIL / ADMIN_EMAILS.
    Supports comma (,) or semicolon (;) separated lists."""
    approver = os.getenv("APPROVER_EMAIL")
    if approver and approver.strip():
        raw_vals = [approver]
    else:
        raw_vals = [os.getenv("ADMIN_EMAIL", ""), os.getenv("ADMIN_EMAILS", "")]
    recipients: list[str] = []
    for raw in raw_vals:
        if not raw:
            continue
        for part in re.split(r"[,;]", raw):
            cleaned = part.strip()
            if cleaned and cleaned not in recipients:
                recipients.append(cleaned)
    return recipients


def get_approver_cc_recipients() -> list[str]:
    """Returns a list of clean, unique CC email addresses configured in APPROVER_CC or APPROVAL_DIGEST_CC.
    Defaults to ['shweta.s@ozellar.com']."""
    raw_val = os.getenv("APPROVER_CC") or os.getenv("APPROVAL_DIGEST_CC") or "shweta.s@ozellar.com"
    cc_list: list[str] = []
    for part in re.split(r"[,;]", raw_val):
        cleaned = part.strip()
        if cleaned and cleaned not in cc_list:
            cc_list.append(cleaned)
    return cc_list


def send_digest_email(
    admin_email: str | list[str],
    approvals: list,
    cc_emails: list[str] | str | None = None
):
    """Sends a digest email with a table of pending approvals to the primary admin recipient with CC."""
    if not approvals:
        return

    recipients: list[str] = []
    if isinstance(admin_email, list):
        for item in admin_email:
            if isinstance(item, str):
                for part in re.split(r"[,;]", item):
                    cleaned = part.strip()
                    if cleaned and cleaned not in recipients:
                        recipients.append(cleaned)
    elif isinstance(admin_email, str):
        for part in re.split(r"[,;]", admin_email):
            cleaned = part.strip()
            if cleaned and cleaned not in recipients:
                recipients.append(cleaned)

    if not recipients:
        return

    to_recipient = recipients[0]
    cc_list: list[str] = []

    # Secondary admin emails from admin_email become CC
    for r in recipients[1:]:
        if r.lower() != to_recipient.lower() and r not in cc_list:
            cc_list.append(r)

    # Add explicitly passed CCs or default approval digest CC (shweta.s@ozellar.com)
    if cc_emails is not None:
        raw_ccs = re.split(r"[,;]", cc_emails) if isinstance(cc_emails, str) else cc_emails
        for c in raw_ccs:
            cleaned = (c or "").strip()
            if cleaned and cleaned.lower() != to_recipient.lower() and cleaned not in cc_list:
                cc_list.append(cleaned)
    else:
        for c in DEFAULT_APPROVAL_DIGEST_CC:
            cleaned = c.strip()
            if cleaned and cleaned.lower() != to_recipient.lower() and cleaned not in cc_list:
                cc_list.append(cleaned)

    rows = ""
    for ap in approvals:
        accept_url = f"{PUBLIC_BASE_URL}/api/approve?token={ap['token']}"
        reject_url = f"{PUBLIC_BASE_URL}/api/reject?token={ap['token']}"
        preview_url = f"{PUBLIC_BASE_URL}/api/preview-certificate?token={ap['token']}"

        score_str = f"{ap['score']}%" if ap.get('score') is not None else "N/A"

        status_val = (ap.get("status") or ap.get("vessel_status") or "").strip()
        vessel_val = (ap.get("vessel") or "").strip()
        is_onboard = status_val.lower() == "onboard"

        if is_onboard:
            vessel_html = (
                f'<div style="font-size: 11.5px; font-weight: 600; color: #0f172a; margin-top: 3px;">{vessel_val}</div>'
                if vessel_val
                else ""
            )
            status_cell = (
                f'<span style="display: inline-block; background-color: #dcfce7; color: #15803d; font-weight: 700; font-size: 11px; padding: 2px 7px; border-radius: 4px; border: 1px solid #bbf7d0;">ONBOARD</span>{vessel_html}'
            )
        else:
            status_cell = (
                '<span style="display: inline-block; background-color: #f1f5f9; color: #64748b; font-weight: 700; font-size: 11px; padding: 2px 7px; border-radius: 4px; border: 1px solid #e2e8f0;">LEAVE</span>'
            )

        rows += f"""
        <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">{ap['learner_name']}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">{ap['crew_id']}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">{ap.get('rank') or '—'}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">{status_cell}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">{_format_mobile(ap.get('mobile_no')) or '—'}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">{ap['course_title']}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">{score_str}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">
                <a href="{preview_url}" style="background-color: #2196F3; color: white; padding: 6px 12px; text-decoration: none; border-radius: 4px;">Preview</a>
            </td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">
                <a href="{accept_url}" style="background-color: #4CAF50; color: white; padding: 6px 12px; text-decoration: none; border-radius: 4px;">Approve</a>
            </td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">
                <a href="{reject_url}" style="background-color: #f44336; color: white; padding: 6px 12px; text-decoration: none; border-radius: 4px;">Reject</a>
            </td>
        </tr>
        """

    html = f"""
    <html>
    <head>
    <style>
        table {{ border-collapse: collapse; width: 100%; font-family: sans-serif; }}
        th {{ background-color: #f2f2f2; padding: 8px; border: 1px solid #ddd; text-align: left; }}
    </style>
    </head>
    <body>
        <h2>Pending Assessment Approvals</h2>
        <p>The following crew members have passed their assessments and are waiting for their certificates. Clicking <b>Approve</b> opens a confirmation page where you'll add a remark before the certificate is issued.</p>
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Crew ID</th>
                    <th>Rank</th>
                    <th>Status / Vessel</th>
                    <th>Mobile No</th>
                    <th>Course</th>
                    <th>Score</th>
                    <th>Preview</th>
                    <th>Approve</th>
                    <th>Reject</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>
    </body>
    </html>
    """
    _send_email(
        to_email=to_recipient,
        subject=f"Pending Assessment Approvals ({len(approvals)})",
        html_content=html,
        cc_emails=cc_list
    )


def send_approval_email(crew_email: str, crew_name: str, course_title: str, cert_pdf: bytes, cert_id: str, cc_emails: list[str] | str | None = None):
    """Sends the generated certificate to the crew member after admin approval."""
    html = f"""
    <html>
    <body style="font-family: sans-serif;">
        <p>Dear {crew_name},</p>
        <p>Congratulations! Your final assessment for <b>{course_title}</b> has been approved.</p>
        <p>Your certificate is attached to this email.</p>
        <br>
        <p>Ozellar Marine Training Team</p>
    </body>
    </html>
    """
    _send_email(
        to_email=crew_email,
        subject=f"Certificate for {course_title}",
        html_content=html,
        attachment=(f"{cert_id}.pdf", cert_pdf),
        cc_emails=cc_emails if cc_emails is not None else DEFAULT_COURSE_REMINDER_CC
    )


def send_rejection_email(crew_email: str, crew_name: str, course_title: str):
    """Sends a notification to the crew member if the admin rejects their assessment."""
    html = f"""
    <html>
    <body style="font-family: sans-serif;">
        <p>Dear {crew_name},</p>
        <p>Your final assessment for <b>{course_title}</b> was reviewed but has not been approved at this time.</p>
        <p>Please contact your training officer for further instructions or to retry the assessment.</p>
        <br>
        <p>Best regards,<br>Ozellar Marine Training Team</p>
    </body>
    </html>
    """
    _send_email(
        to_email=crew_email,
        subject=f"Assessment Update: {course_title}",
        html_content=html
    )


def send_course_reminder_email(
    crew_email: str,
    crew_name: str,
    pending_courses: list[str] | None = None,
    from_email: str | None = None,
    cc_emails: list[str] | str | None = None
) -> bool:
    """Sends a professional instruction/reminder email to a seafarer to complete assigned courses."""
    if not crew_email or not crew_email.strip():
        return False

    sender = from_email or COURSE_REMINDER_SENDER
    cc_list = cc_emails if cc_emails is not None else DEFAULT_COURSE_REMINDER_CC
    portal_url = PRODUCTION_PORTAL_URL.rstrip("/")
    portal_host = "training.ozellar.com"
    clean_name = crew_name.strip() if crew_name and crew_name.strip() else "Seafarer"
    support_email = os.getenv("SUPPORT_EMAIL", "techdevops@ozellar.com")

    courses_card = ""
    if pending_courses:
        course_items = "".join([
            f"""
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; font-size: 13.5px; color: #0f172a; font-weight: 600;">
                    <span style="color: #059669; margin-right: 8px;">●</span> {c}
                </td>
                <td style="padding: 10px 14px; text-align: right; white-space: nowrap;">
                    <span style="display: inline-block; background-color: #fef3c7; color: #b45309; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; border: 1px solid #fde68a;">Pending</span>
                </td>
            </tr>
            """
            for c in pending_courses
        ])
        courses_card = f"""
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 18px 0 22px 0; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; border-collapse: separate; border-spacing: 0;">
            <thead>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #059669;">
                    <th align="left" style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #065f46; text-transform: uppercase; letter-spacing: 0.04em;">Assigned Course(s) to Complete ({len(pending_courses)})</th>
                    <th align="right" style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.04em;">Status</th>
                </tr>
            </thead>
            <tbody>
                {course_items}
            </tbody>
        </table>
        """

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Assigned Course Instructions - Ozellar Marine Training</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 28px 12px;">
    <tr>
        <td align="center">
            <!-- Main Email Container -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 620px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 18px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
                
                <!-- Brand Green Header -->
                <tr>
                    <td style="background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%); padding: 26px 32px; text-align: left;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                                <td>
                                    <div style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: 0.06em; text-transform: uppercase; margin: 0;">
                                        OZELLAR <span style="color: #f97316;">MARINE</span>
                                    </div>
                                    <div style="font-size: 12px; font-weight: 600; color: #a7f3d0; letter-spacing: 0.04em; text-transform: uppercase; margin-top: 4px;">
                                        Maritime Training &amp; Competency Portal
                                    </div>
                                </td>
                                <td align="right" style="vertical-align: middle;">
                                    <span style="display: inline-block; padding: 4px 12px; background: rgba(234, 88, 12, 0.2); border: 1px solid rgba(249, 115, 22, 0.6); border-radius: 999px; color: #fed7aa; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">
                                        Official Notice
                                    </span>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- Green to Orange Accent Strip -->
                <tr>
                    <td style="height: 5px; background: linear-gradient(90deg, #10b981 0%, #059669 35%, #f97316 70%, #E07820 100%);"></td>
                </tr>

                <!-- Body Content -->
                <tr>
                    <td style="padding: 32px 32px 28px 32px;">
                        
                        <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #0f172a;">
                            Good day {clean_name},
                        </p>
                        
                        <p style="margin: 0 0 16px 0; font-size: 14.5px; line-height: 1.65; color: #334155;">
                            Please be advised to complete your assigned training course(s) on the <strong>Ozellar Marine Training</strong> portal. Timely completion is essential for vessel compliance and crew certification.
                        </p>

                        {courses_card}

                        <!-- Instructions Step Box -->
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 5px solid #059669; border-radius: 6px;">
                            <tr>
                                <td style="padding: 18px 22px;">
                                    <div style="font-size: 13.5px; font-weight: 800; color: #ea580c; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px;">
                                        Message / Instructions to Complete:
                                    </div>
                                    <ol style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #1e293b;">
                                        <li style="margin-bottom: 6px;">
                                            Access <a href="{portal_url}" style="color: #059669; font-weight: 700; text-decoration: underline;">{portal_host}</a>
                                        </li>
                                        <li style="margin-bottom: 6px;">
                                            Click in <strong>Seafarer</strong> &mdash; enter your registered <strong>Name</strong> and <strong>Date of Birth (DOB)</strong>
                                        </li>
                                        <li style="margin-bottom: 6px;">
                                            Upload passport size photo &mdash; <em>this photo will be used for your official certification</em>
                                        </li>
                                        <li style="margin-bottom: 0;">
                                            <strong>Complete the assigned courses</strong>
                                        </li>
                                    </ol>
                                </td>
                            </tr>
                        </table>

                        <!-- CTA Button -->
                        <div style="text-align: center; margin: 30px 0 24px 0;">
                            <a href="{portal_url}" style="display: inline-block; background: linear-gradient(135deg, #E07820 0%, #ea580c 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 36px; border-radius: 8px; box-shadow: 0 4px 14px rgba(224, 120, 32, 0.35); letter-spacing: 0.02em;">
                                Access Training Portal &rarr;
                            </a>
                        </div>

                        <!-- Portal & Support Info -->
                        <div style="margin: 18px 0 0 0; padding: 12px 16px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 12.5px; color: #64748b; line-height: 1.5;">
                            <strong>Portal URL:</strong> <a href="{portal_url}" style="color: #059669; text-decoration: none;">{portal_url}</a><br>
                            <strong>Support Email:</strong> <a href="mailto:{support_email}" style="color: #ea580c; font-weight: 600; text-decoration: none;">{support_email}</a>
                        </div>

                    </td>
                </tr>

                <!-- Footer -->
                <tr>
                    <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 32px; text-align: center;">
                        <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                            &copy; Ozellar Marine Services. All rights reserved. &bull; <a href="{portal_url}" style="color: #059669; text-decoration: underline;">training.ozellar.com</a>
                        </p>
                    </td>
                </tr>

            </table>
        </td>
    </tr>
</table>
</body>
</html>"""

    subject = "Action Required: Complete Your Assigned Courses - Ozellar Marine Training"
    if pending_courses and len(pending_courses) == 1:
        subject = f"Action Required: Complete Assigned Course: {pending_courses[0]} - Ozellar Marine Training"

    return _send_email(
        to_email=crew_email.strip(),
        subject=subject,
        html_content=html,
        from_email=sender,
        cc_emails=cc_list
    )


def send_course_reminder_batch(
    targets: list[dict],
    from_email: str | None = None,
    cc_emails: list[str] | str | None = None
) -> int:
    """Dispatches course reminder emails to a list of seafarers.
    Each item in targets: {"email": str, "name": str, "pending_courses": list[str]}
    Returns the count of successfully sent emails.
    """
    sender = from_email or COURSE_REMINDER_SENDER
    sent_count = 0
    for t in targets:
        email = (t.get("email") or "").strip()
        if not email:
            continue
        name = t.get("name") or "Seafarer"
        courses = t.get("pending_courses") or []
        try:
            if send_course_reminder_email(email, name, courses, from_email=sender, cc_emails=cc_emails):
                sent_count += 1
        except Exception as e:
            print(f"[email_service] Error auto-sending reminder to {email}: {e}")
    return sent_count
