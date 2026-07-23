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


def build_certificate_pdf(data: dict) -> bytes:
    """data keys: id, learner, ppNo, titleUpper, issued, location, topics[],
    verifyUrl, photoPath (optional)."""
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Certificate {data['id']}")

    # outer border
    c.setStrokeColor(INK)
    c.setLineWidth(1.2)
    c.rect(20 * mm, 18 * mm, W - 40 * mm, H - 36 * mm)

    # logo — top right
    try:
        logo = ImageReader(_LOGO)
        lw, lh = logo.getSize()
        disp_w = 42 * mm
        disp_h = disp_w * lh / lw
        c.drawImage(logo, RIGHT - disp_w, _y(30 * mm + disp_h) + 0, disp_w, disp_h,
                    mask="auto", preserveAspectRatio=True)
    except Exception:
        pass

    # company + address (centred)
    cx = W / 2
    c.setFillColor(ORANGE)
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(cx, _y(34 * mm), "OZELLAR MARINE PRIVATE LIMITED")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawCentredString(cx, _y(41 * mm), "Aneja Towers, B Block 4th Floor,")
    c.drawCentredString(cx, _y(45.5 * mm), "Perungudi, Chennai – 600096")

    # certificate number — right side
    _blank(c, W / 2 + 6 * mm, 66 * mm, "Certificate No:", data["id"], 55 * mm,
           label_size=11, value_size=10)

    # certifying lines — left aligned, fill-in-the-blank
    end = _blank(c, LEFT, 78 * mm, "This is to certify that", data["learner"] or "",
                 62 * mm, value_size=11)
    end = _blank(c, LEFT, 88 * mm, "PP No", data["ppNo"] or "", 42 * mm, value_size=11)
    c.setFont("Helvetica", 11)
    c.setFillColor(INK)
    c.drawString(end + 6, _y(88 * mm), "has successfully completed")

    # course title — centred, bold
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(cx, _y(106 * mm), data["titleUpper"])

    # conducted on <date> at <location>
    y = 116 * mm
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
    bw2 = 40 * mm
    c.line(x, _y(y) - 2, x + bw2, _y(y) - 2)
    c.drawCentredString(x + bw2 / 2, _y(y) + 1.5, data.get("location") or "")

    # topics
    c.setFont("Helvetica-Bold", 11)
    c.drawString(LEFT, _y(130 * mm), "This course covered the following topics:")
    ty = 139 * mm
    for t in (data["topics"] or []):
        c.setFillColor(ORANGE)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(LEFT + 4 * mm, _y(ty), "•")
        c.setFillColor(INK)
        c.setFont("Helvetica", 10)
        # wrap long topic lines
        for line in _wrap(c, t, "Helvetica", 10, RIGHT - (LEFT + 9 * mm)):
            c.drawString(LEFT + 9 * mm, _y(ty), line)
            ty += 5.2 * mm
        ty += 1.5 * mm

    # photo frame — bottom left (empty placeholder unless a photo is supplied)
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

    # signature image + line — bottom right
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

    # date of issue (left) + rev no (right)
    _blank(c, LEFT, 246 * mm, "Date of Issue:", data["issued"], 34 * mm, value_size=10)
    c.setFont("Helvetica", 8)
    c.setFillColor(GREY)
    c.drawRightString(RIGHT, _y(258 * mm), "Rev No 001/2026/10-03-2026")

    # verification line (footer, inside border)
    c.setFont("Helvetica", 7.5)
    c.setFillColor(GREY)
    c.drawCentredString(cx, _y(266 * mm),
                        f"Certificate No {data['id']}  ·  Verify at {data['verifyUrl']}")

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
