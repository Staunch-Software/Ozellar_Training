import os
import requests
import msal
import base64

# Graph API Credentials
TENANT_ID = os.getenv("AZURE_TENANT_ID")
CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
# The mailbox to send from (e.g., noreply@ozellar.com). It must have Mail.Send permission in Azure.
SMTP_USER = os.getenv("SMTP_USER", "noreply@ozellar.com")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://training.ozellar.com")


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


def _send_email(to_email: str, subject: str, html_content: str, attachment=None):
    token = _get_access_token()
    if not token:
        print(f"[email_service] Email sending skipped (missing Graph API credentials or token error). To: {to_email}")
        return

    endpoint = f"https://graph.microsoft.com/v1.0/users/{SMTP_USER}/sendMail"
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
        response = requests.post(endpoint, headers=headers, json=payload)
        response.raise_for_status()
        print(f"[email_service] Sent email to {to_email} via Graph API")
    except requests.exceptions.HTTPError as e:
        print(f"[email_service] Graph API Error sending email to {to_email}: {e.response.text}")
    except Exception as e:
        print(f"[email_service] Error sending email to {to_email}: {e}")


def send_digest_email(admin_email: str, approvals: list):
    """Sends a digest email with a table of pending approvals and Accept/Reject buttons."""
    if not approvals:
        return

    rows = ""
    for ap in approvals:
        accept_url = f"{PUBLIC_BASE_URL}/api/approve?token={ap['token']}"
        reject_url = f"{PUBLIC_BASE_URL}/api/reject?token={ap['token']}"
        preview_url = f"{PUBLIC_BASE_URL}/api/preview-certificate?token={ap['token']}"
        
        score_str = f"{ap['score']}%" if ap.get('score') is not None else "N/A"

        rows += f"""
        <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">{ap['learner_name']}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">{ap['crew_id']}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">{ap['course_title']}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">{score_str}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">
                <a href="{preview_url}" style="background-color: #2196F3; color: white; padding: 6px 12px; text-decoration: none; border-radius: 4px;">Preview</a>
            </td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">
                <a href="{accept_url}" style="background-color: #4CAF50; color: white; padding: 6px 12px; text-decoration: none; border-radius: 4px;">Accept</a>
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
        <p>The following crew members have passed their assessments and are waiting for their certificates.</p>
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Crew ID</th>
                    <th>Course</th>
                    <th>Score</th>
                    <th>Preview</th>
                    <th>Accept</th>
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
    _send_email(admin_email, f"Pending Assessment Approvals ({len(approvals)})", html)


def send_approval_email(crew_email: str, crew_name: str, course_title: str, cert_pdf: bytes, cert_id: str):
    """Sends the generated certificate to the crew member after admin approval."""
    html = f"""
    <html>
    <body style="font-family: sans-serif;">
        <p>Dear {crew_name},</p>
        <p>Congratulations! Your final assessment for <b>{course_title}</b> has been approved.</p>
        <p>Your certificate is attached to this email.</p>
        <br>
        <p>Best regards,<br>Ozellar Marine Training Team</p>
    </body>
    </html>
    """
    _send_email(
        to_email=crew_email,
        subject=f"Certificate for {course_title}",
        html_content=html,
        attachment=(f"{cert_id}.pdf", cert_pdf)
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
