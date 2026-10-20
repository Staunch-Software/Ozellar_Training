"""PDF renderer for the Pre-Joining Briefing form (OF-MA-010), laid out like
the paper form: one page per department (Description | Yes/No/N-A | Comments,
briefing officer + signature/date row), then the confirmation page with the
senior officer / Technical Director / Managing Director sign-offs.

Electronic "signatures" are the signer's name in italics plus the IST
timestamp of their approval.
"""
import io
import os
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (BaseDocTemplate, Flowable, Frame, PageBreak,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)
from xml.sax.saxutils import escape

from . import briefing_template as tpl

_ASSETS = os.path.join(os.path.dirname(__file__), "assets")
_LOGO = os.path.join(_ASSETS, "logo.png")

W, H = A4
MARGIN_X = 18 * mm
FRAME_TOP = 38 * mm
FRAME_BOTTOM = 18 * mm
INK = colors.HexColor("#1a1a1a")
GREY = colors.HexColor("#8a8a8a")
LINE = colors.HexColor("#444444")
SIGN_BLUE = colors.HexColor("#1f3a8a")

_base = getSampleStyleSheet()
ST_ITEM = ParagraphStyle("item", parent=_base["Normal"], fontName="Helvetica",
                         fontSize=9, leading=11.5, textColor=INK)
ST_COMMENT = ParagraphStyle("comment", parent=ST_ITEM, fontSize=8.5, leading=11)
ST_HEAD = ParagraphStyle("head", parent=ST_ITEM, fontName="Helvetica-Bold",
                         fontSize=9.5, alignment=TA_CENTER)
ST_SECTION = ParagraphStyle("section", parent=ST_ITEM, fontName="Helvetica-Bold",
                            fontSize=12, alignment=TA_CENTER, leading=15)
ST_LABEL = ParagraphStyle("label", parent=ST_ITEM, fontSize=9)
ST_SIGN = ParagraphStyle("sign", parent=ST_ITEM, fontName="Helvetica-Oblique",
                         fontSize=10, textColor=SIGN_BLUE, leading=12)
ST_SIGN_SMALL = ParagraphStyle("signsmall", parent=ST_SIGN, fontName="Helvetica",
                               fontSize=7.5, leading=9, textColor=GREY)
ST_INTRO = ParagraphStyle("intro", parent=ST_ITEM, fontSize=10, leading=13)
ST_BOLD = ParagraphStyle("bold", parent=ST_ITEM, fontName="Helvetica-Bold", fontSize=10)


def _p(text, style):
    return Paragraph(escape(text or "").replace("\n", "<br/>"), style)


def fmt_stamp(dt: datetime | None) -> str:
    return dt.strftime("%d-%b-%Y %H:%M IST") if dt else ""


class ResponseBoxes(Flowable):
    """Three tick boxes — Yes / No / N/A — with the chosen one ticked."""
    LABELS = (("yes", "Yes"), ("no", "No"), ("na", "N/A"))

    def __init__(self, response, width=30 * mm):
        super().__init__()
        self.response = response
        self.width, self.height = width, 11

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        c = self.canv
        slot = self.width / 3
        for i, (key, label) in enumerate(self.LABELS):
            x = i * slot + 1.5
            c.setStrokeColor(LINE)
            c.setLineWidth(0.6)
            c.rect(x, 1.5, 7, 7, stroke=1, fill=0)
            if self.response == key:
                c.setStrokeColor(SIGN_BLUE)
                c.setLineWidth(1.4)
                c.line(x + 1.3, 4.6, x + 3.2, 2.6)
                c.line(x + 3.2, 2.6, x + 6.2, 7.6)
            c.setFillColor(INK)
            c.setFont("Helvetica", 6.8)
            c.drawString(x + 8.5, 3.2, label)


def _section_table(section, usable_w):
    dept = section.department
    answers = section.answers or {}
    col_w = [usable_w * 0.55, 30 * mm, usable_w - usable_w * 0.55 - 30 * mm]
    rows = [[_p(tpl.DEPARTMENT_LABELS[dept], ST_SECTION), "", ""],
            [_p("Description of items", ParagraphStyle("hu", parent=ST_HEAD)),
             _p("Yes / No / N/A", ST_HEAD), _p("Comments", ST_HEAD)]]
    for key, text in tpl.SECTIONS[dept]:
        a = answers.get(key) or {}
        rows.append([_p(text, ST_ITEM), ResponseBoxes(a.get("response"), 30 * mm - 4),
                     _p(a.get("remarks"), ST_COMMENT)])

    signed = section.status == "approved"
    left = [Spacer(1, 6 * mm)]
    right = [Spacer(1, 2 * mm)]
    if signed:
        left = [_p(section.approved_by_name, ST_SIGN), Spacer(1, 1.5 * mm)]
        right = [_p(section.approved_by_name, ST_SIGN),
                 _p("Approved electronically  " + fmt_stamp(section.approved_at), ST_SIGN_SMALL)]
    left.append(_p("Name of briefing officer", ST_LABEL))
    right.append(_p("Signature / Date", ST_LABEL))
    rows.append([left, "", right])

    n = len(rows)
    t = Table(rows, colWidths=col_w, repeatRows=2)
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, LINE),
        ("BOX", (0, 0), (-1, -1), 0.9, LINE),
        ("SPAN", (0, 0), (-1, 0)),
        ("SPAN", (0, n - 1), (1, n - 1)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("VALIGN", (0, n - 1), (-1, n - 1), "BOTTOM"),
        ("TOPPADDING", (0, 1), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, 0), 5),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
    ]))
    return t


def _line_block(name, label, stamp_text, usable_w):
    """Two-column row: '<label>: name' (left) and 'Signature: signed-by + time' (right)."""
    left = [_p(name, ST_SIGN) if name else Spacer(1, 7 * mm),
            _p(label, ST_BOLD)]
    right = ([_p(name, ST_SIGN), _p(stamp_text, ST_SIGN_SMALL)] if name
             else [Spacer(1, 7 * mm)])
    right.append(_p("Signature:", ST_BOLD))
    t = Table([[left, right]], colWidths=[usable_w * 0.5, usable_w * 0.5])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                           ("LINEBELOW", (0, 0), (0, 0), 0, colors.white),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    return t


def build_briefing_pdf(briefing, learner) -> bytes:
    buf = io.BytesIO()
    in_progress = briefing.status != "completed"
    usable_w = W - 2 * MARGIN_X

    def draw_page(c, doc):
        c.saveState()
        try:
            logo = ImageReader(_LOGO)
            lw, lh = logo.getSize()
            dw = 40 * mm
            dh = dw * lh / lw
            c.drawImage(logo, MARGIN_X - 2 * mm, H - 12 * mm - dh, dw, dh, mask="auto")
        except Exception:
            c.setFont("Helvetica-Bold", 18)
            c.setFillColor(colors.HexColor("#E8833A"))
            c.drawString(MARGIN_X, H - 24 * mm, "ozellar MARINE")
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 10.5)
        title_x = W / 2 + 4 * mm
        c.drawCentredString(title_x, H - 22 * mm, tpl.TITLE)
        tw = c.stringWidth(tpl.TITLE, "Helvetica-Bold", 10.5)
        c.setLineWidth(0.8)
        c.line(title_x - tw / 2, H - 23.2 * mm, title_x + tw / 2, H - 23.2 * mm)
        c.setFont("Helvetica", 8.5)
        c.drawRightString(W - MARGIN_X, H - 19 * mm, f"Revision No : {tpl.REVISION}")
        c.drawRightString(W - MARGIN_X, H - 24 * mm, f"Date: {tpl.REVISION_DATE}")
        c.setFont("Helvetica-Bold", 9)
        c.drawRightString(W - MARGIN_X, 10 * mm, tpl.FORM_NO)
        if in_progress:
            c.setFont("Helvetica-Bold", 64)
            c.setFillColor(colors.Color(0.5, 0.5, 0.5, alpha=0.10))
            c.translate(W / 2, H / 2)
            c.rotate(42)
            c.drawCentredString(0, 0, "IN PROGRESS")
        c.restoreState()

    doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=MARGIN_X, rightMargin=MARGIN_X,
                          topMargin=FRAME_TOP, bottomMargin=FRAME_BOTTOM,
                          title=f"{tpl.TITLE} - {learner.full_name if learner else ''}",
                          author="Ozellar Marine")
    frame = Frame(MARGIN_X, FRAME_BOTTOM, usable_w, H - FRAME_TOP - FRAME_BOTTOM,
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="form", frames=[frame], onPage=draw_page)])

    name = learner.full_name if learner else ""
    bdate = briefing.briefing_date.strftime("%d-%b-%Y") if briefing.briefing_date else ""
    info = Table([
        [_p("NAME:  " + name, ST_BOLD), _p("RANK:  " + (briefing.rank or ""), ST_BOLD)],
        [_p("JOINING VESSEL:  " + (briefing.joining_vessel or ""), ST_BOLD),
         _p("DATE:  " + bdate, ST_BOLD)],
    ], colWidths=[usable_w * 0.6, usable_w * 0.4])
    info.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 3),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0)]))

    story = [info, Spacer(1, 4 * mm), _p(tpl.INTRO, ST_INTRO), Spacer(1, 5 * mm)]
    by_dept = {s.department: s for s in briefing.sections}
    for i, dept in enumerate(tpl.DEPARTMENTS):
        if dept not in by_dept:
            continue
        if i > 0:
            story.append(PageBreak())
        story.append(_section_table(by_dept[dept], usable_w))

    # Confirmation block (same page as the last section, as on the paper form)
    story += [Spacer(1, 8 * mm), _p(tpl.CONFIRMATION, ST_INTRO), Spacer(1, 6 * mm),
              _line_block(name or None if briefing.crew_ack_at else None,
                          "Name of the Senior Officer :", fmt_stamp(briefing.crew_ack_at), usable_w),
              Spacer(1, 8 * mm),
              _line_block(briefing.td_name, "Technical Director:", fmt_stamp(briefing.td_at), usable_w),
              Spacer(1, 8 * mm),
              _line_block(briefing.md_name, "Managing Director:", fmt_stamp(briefing.md_at), usable_w),
              Spacer(1, 8 * mm), _p("Comments/ Discussion Points:", ST_BOLD), Spacer(1, 2 * mm),
              _p(briefing.crew_comments or "", ST_ITEM)]

    doc.build(story)
    return buf.getvalue()
