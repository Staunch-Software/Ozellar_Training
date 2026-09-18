"""Server-side certificate PDF generation (ReportLab).

Rebuilt to match the official Ozellar Marine certificate (see the reference PDF):
logo top-right, fill-in-the-blank underlined fields, left-aligned letter layout,
an (optional) candidate photo frame bottom-left, and the course-in-charge
signature bottom-right. Pure-Python — no system libraries — so it renders the
same on Windows and Ubuntu.

This is the SINGLE source of truth for the certificate: the frontend previews
the very PDF this produces (embedded), so what a learner sees is exactly what
downloads.
"""
import io
import os

import qrcode
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as _canvas

_ASSETS = os.path.join(os.path.dirname(__file__), "assets")
_LOGO = os.path.join(_ASSETS, "logo.png")
_SIGN = os.path.join(_ASSETS, "signature.png")

ORANGE = HexColor("#E4611F")
INK = HexColor("#1a1a1a")
GREY = HexColor("#666666")
FRAME = HexColor("#b9c0cc")

W, H = A4
LEFT = 40 * mm      # left content margin
RIGHT = W - 28 * mm  # right content edge


def _y(top):
    """Convert a distance-from-top (pts) to a ReportLab y (from bottom)."""
    return H - top


def _blank(c, x, top, label, value, blank_w, label_size=11, value_size=11,
           bold_label=False):
    """Draw 'label  ____value____' and return the x where the blank ends."""
    y = _y(top)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold" if bold_label else "Helvetica", label_size)
    if label:
        c.drawString(x, y, label)
        x += c.stringWidth(label + " ", "Helvetica-Bold" if bold_label else "Helvetica", label_size)
    bx1 = x + blank_w
    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    c.line(x, y - 2, bx1, y - 2)
    c.setFont("Helvetica", value_size)
    c.drawCentredString((x + bx1) / 2, y + 1.5, value or "")
    return bx1


def _qr_reader(url: str):
    """Build a QR code encoding `url` and return it as an ImageReader, or
    None if it can't be generated (e.g. no verify URL yet)."""
    if not url:
        return None
    try:
        img = qrcode.make(url, border=1)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return ImageReader(buf)
    except Exception:
        return None


def build_certificate_pdf(data: dict) -> bytes:
    """data keys: id, learner, ppNo, titleUpper, issued, location, topics[],
    verifyUrl, photoPath (optional), durationHours (int)."""
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Certificate {data['id']}")

    # ── outer border ──────────────────────────────────────────────────────────
    c.setStrokeColor(INK)
    c.setLineWidth(1.2)
    c.rect(20 * mm, 18 * mm, W - 40 * mm, H - 36 * mm)

    # ── logo — top right ──────────────────────────────────────────────────────
    try:
        logo = ImageReader(_LOGO)
        lw, lh = logo.getSize()
        disp_w = 42 * mm
        disp_h = disp_w * lh / lw
        c.drawImage(logo, RIGHT - disp_w, _y(30 * mm + disp_h), disp_w, disp_h,
                    mask="auto", preserveAspectRatio=True)
    except Exception:
        pass

    # ── company + address (centred) ───────────────────────────────────────────
    cx = W / 2
    c.setFillColor(ORANGE)
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(cx, _y(28 * mm), "OZELLAR MARINE PRIVATE LIMITED")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawCentredString(cx, _y(34 * mm), "Aneja Towers, B Block 4th Floor,")
    c.drawCentredString(cx, _y(38 * mm), "Perungudi, Chennai – 600096")

    # ── certificate number — right side ──────────────────────────────────────
    cert_id = data["id"]
    cert_no_label = "Certificate No:"
    cert_no_label_w = c.stringWidth(cert_no_label + " ", "Helvetica", 11)
    cert_no_start_x = W / 2 + 6 * mm
    cert_no_blank_w = RIGHT - cert_no_start_x - cert_no_label_w - 2 * mm
    cert_no_blank_w = max(cert_no_blank_w, 40 * mm)
    _blank(c, cert_no_start_x, 50 * mm, cert_no_label, cert_id, cert_no_blank_w,
           label_size=11, value_size=10)

    # ── certifying lines — left aligned, fill-in-the-blank ───────────────────
    learner_label = "This is to certify that"
    learner_label_w = c.stringWidth(learner_label + " ", "Helvetica", 11)
    learner_blank_w = min(62 * mm, RIGHT - LEFT - learner_label_w - 4 * mm)
    end = _blank(c, LEFT, 62 * mm, learner_label, data["learner"] or "",
                 learner_blank_w, value_size=11)

    pp_label = "PP No"
    completed_text = "has successfully completed"
    completed_w = c.stringWidth(completed_text, "Helvetica", 11)
    available = RIGHT - LEFT - c.stringWidth(pp_label + " ", "Helvetica", 11) - 6
    pp_blank_w = min(42 * mm, available - completed_w - 8)
    end = _blank(c, LEFT, 70 * mm, pp_label, data["ppNo"] or "", pp_blank_w, value_size=11)
    c.setFont("Helvetica", 11)
    c.setFillColor(INK)
    avail_w = RIGHT - (end + 6)
    c.drawString(end + 6, _y(70 * mm),
                 completed_text if c.stringWidth(completed_text, "Helvetica", 11) <= avail_w
                 else "has successfully")

    # ── course title — centred, bold, auto-wrap ───────────────────────────────
    c.setFillColor(INK)
    title_max_w = RIGHT - LEFT
    title_font_size = 16
    title_lines = _wrap(c, data["titleUpper"], "Helvetica-Bold", title_font_size, title_max_w)
    if len(title_lines) == 1 and c.stringWidth(title_lines[0], "Helvetica-Bold", title_font_size) > title_max_w:
        for fs in range(15, 9, -1):
            if c.stringWidth(title_lines[0], "Helvetica-Bold", fs) <= title_max_w:
                title_font_size = fs
                break
    c.setFont("Helvetica-Bold", title_font_size)
    title_line_h = 6 * mm
    title_top = 84 * mm
    for tl in title_lines:
        c.drawCentredString(cx, _y(title_top), tl)
        title_top += title_line_h

    # ── conducted on <date> at <location> ────────────────────────────────────
    y = title_top + 2 * mm
    c.setFont("Helvetica", 11)
    seg = "Conducted on "
    x = LEFT + 18 * mm
    c.drawString(x, _y(y), seg)
    x += c.stringWidth(seg, "Helvetica", 11)
    bw = 38 * mm
    c.setLineWidth(0.6)
    c.line(x, _y(y) - 2, x + bw, _y(y) - 2)
    c.drawCentredString(x + bw / 2, _y(y) + 1.5, data["issued"])
    x += bw
    seg = "  at "
    c.drawString(x, _y(y), seg)
    x += c.stringWidth(seg, "Helvetica", 11)
    bw2 = min(40 * mm, RIGHT - x - 2 * mm)
    c.line(x, _y(y) - 2, x + bw2, _y(y) - 2)
    c.drawCentredString(x + bw2 / 2, _y(y) + 1.5, data.get("location") or "")

    # ── topics — full-width, max 8, auto-shrink font ──────────────────────────
    # Available vertical space: from heading to just above photo (196mm)
    TOPIC_TOP    = y + 4 * mm          # heading y
    TOPIC_BOTTOM = 192 * mm            # bottom limit (photo frame at 196mm)
    TOPIC_AVAIL  = TOPIC_BOTTOM - TOPIC_TOP - 9 * mm  # subtract heading row

    topics = (data.get("topics") or [])[:8]  # hard cap at 8

    if topics:
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(INK)
        c.drawString(LEFT, _y(TOPIC_TOP), "This course covered the following topics:")

        BULLET_OFF = 4 * mm
        TEXT_OFF   = 9 * mm
        TEXT_W     = RIGHT - LEFT - TEXT_OFF  # full width for text

        # Auto-select font size so all topics fit: try 10 → 9 → 8 → 7
        chosen_size = 10
        for try_size in [10, 9, 8, 7]:
            line_h = try_size * 0.6 * mm + 3.5 * mm   # empirical: ~pt * 0.6mm + gap
            gap_h  = 1.2 * mm
            total_h = sum(
                len(_wrap(c, t, "Helvetica", try_size, TEXT_W)) * line_h + gap_h
                for t in topics
            )
            if total_h <= TOPIC_AVAIL:
                chosen_size = try_size
                break

        line_h = chosen_size * 0.6 * mm + 3.5 * mm
        gap_h  = 1.2 * mm
        ty = TOPIC_TOP + 9 * mm

        for t in topics:
            t_lines = _wrap(c, t, "Helvetica", chosen_size, TEXT_W)
            c.setFillColor(ORANGE)
            c.setFont("Helvetica-Bold", chosen_size)
            c.drawString(LEFT + BULLET_OFF, _y(ty), "•")
            c.setFillColor(INK)
            c.setFont("Helvetica", chosen_size)
            for line in t_lines:
                c.drawString(LEFT + TEXT_OFF, _y(ty), line)
                ty += line_h
            ty += gap_h

    # ── photo frame — bottom left ─────────────────────────────────────────────
    pf_x, pf_top, pf_w, pf_h = LEFT, 196 * mm, 30 * mm, 38 * mm
    photo = data.get("photoPath")
    if photo and os.path.exists(photo):
        try:
            c.drawImage(ImageReader(photo), pf_x, _y(pf_top + pf_h), pf_w, pf_h,
                        mask="auto", preserveAspectRatio=True)
        except Exception:
            photo = None
    if not photo:
        c.setStrokeColor(FRAME)
        c.setLineWidth(1)
        c.rect(pf_x, _y(pf_top + pf_h), pf_w, pf_h)
        c.setFillColor(FRAME)
        c.setFont("Helvetica", 8)
        c.drawCentredString(pf_x + pf_w / 2, _y(pf_top + pf_h / 2), "Photo")
        c.setFillColor(INK)

    # ── signature image + line — bottom right ────────────────────────────────
    sign_cx = RIGHT - 32 * mm
    try:
        sign = ImageReader(_SIGN)
        sw, sh = sign.getSize()
        s_w = 42 * mm
        s_h = s_w * sh / sw
        c.drawImage(sign, sign_cx - s_w / 2, _y(224 * mm), s_w, s_h,
                    mask="auto", preserveAspectRatio=True)
    except Exception:
        pass
    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    c.line(sign_cx - 34 * mm, _y(226 * mm), sign_cx + 34 * mm, _y(226 * mm))
    c.setFont("Helvetica", 10)
    c.setFillColor(INK)
    c.drawCentredString(sign_cx, _y(231 * mm), "Course In-Charge Signature")

    # ── QR code — bottom right ────────────────────────────────────────────────
    qr = _qr_reader(data.get("verifyUrl"))
    if qr:
        qr_size = 15 * mm
        qr_top = 237 * mm
        c.drawImage(qr, RIGHT - qr_size, _y(qr_top + qr_size), qr_size, qr_size)
        c.setFont("Helvetica", 6)
        c.setFillColor(GREY)
        c.drawCentredString(RIGHT - qr_size / 2, _y(qr_top + qr_size + 3 * mm), "Scan to verify")

    # ── date of issue (left) + rev no (right) ─────────────────────────────────
    _blank(c, LEFT, 246 * mm, "Date of Issue:", data["issued"], 34 * mm, value_size=10)
    c.setFont("Helvetica", 8)
    c.setFillColor(GREY)
    c.drawRightString(RIGHT, _y(252 * mm), "Rev No 001/2026/10-03-2026")

    # ── verification footer — cert no + verify URL ────────────────────────────
    footer_text = f"Certificate No {data['id']}  ·  Verify at {data['verifyUrl']}"
    c.setFont("Helvetica", 7.5)
    c.setFillColor(GREY)
    max_footer_w = RIGHT - LEFT
    while c.stringWidth(footer_text, "Helvetica", 7.5) > max_footer_w and len(footer_text) > 10:
        footer_text = footer_text[:-4] + "…"
    c.drawCentredString(cx, _y(258 * mm), footer_text)

    # ── self-paced duration line — bold, centred, very bottom ────────────────
    duration_hrs = data.get("durationHours") or 4
    duration_text = (
        f"This course is a Self paced Course , with a duration of {duration_hrs} Hours"
    )
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(cx, _y(266 * mm), duration_text)


    c.showPage()
    c.save()
    return buf.getvalue()


def _wrap(c, text, font, size, max_w):
    """Greedy word-wrap to fit max_w; returns a list of lines."""
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if c.stringWidth(trial, font, size) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [""]
