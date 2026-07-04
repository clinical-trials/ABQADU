from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "abq-adu-version-4-bid-tool-improvement-plan.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)


def p(text, style):
    return Paragraph(text, style)


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverTitle",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=28,
    leading=31,
    textColor=colors.HexColor("#0F1F3D"),
    alignment=TA_CENTER,
    spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="CoverSub",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=12,
    leading=17,
    textColor=colors.HexColor("#3D5247"),
    alignment=TA_CENTER,
    spaceAfter=16,
))
styles.add(ParagraphStyle(
    name="Section",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=15,
    leading=18,
    textColor=colors.HexColor("#0F1F3D"),
    spaceBefore=12,
    spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="Body",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=10.5,
    leading=15,
    textColor=colors.HexColor("#1C1917"),
    spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="Small",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=9,
    leading=12,
    textColor=colors.HexColor("#57534E"),
))
styles.add(ParagraphStyle(
    name="TableHeader",
    parent=styles["BodyText"],
    fontName="Helvetica-Bold",
    fontSize=9,
    leading=12,
    textColor=colors.white,
))
styles.add(ParagraphStyle(
    name="Callout",
    parent=styles["BodyText"],
    fontName="Helvetica-Bold",
    fontSize=11,
    leading=15,
    textColor=colors.HexColor("#0F1F3D"),
    backColor=colors.HexColor("#F0EBE1"),
    borderColor=colors.HexColor("#E2D9CA"),
    borderPadding=10,
    borderWidth=1,
    spaceAfter=12,
))


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#0F1F3D"))
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(0.65 * inch, 0.43 * inch, "ABQ ADU - Version 4 Bid Tool Plan")
    canvas.setFillColor(colors.HexColor("#57534E"))
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(7.85 * inch, 0.43 * inch, f"Page {doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(
    str(OUT),
    pagesize=letter,
    rightMargin=0.65 * inch,
    leftMargin=0.65 * inch,
    topMargin=0.62 * inch,
    bottomMargin=0.65 * inch,
)

story = []

story.append(Spacer(1, 0.55 * inch))
story.append(p("ABQ ADU Version 4", styles["CoverTitle"]))
story.append(p("Photovoltonic Bid Tool Improvement Plan", styles["CoverTitle"]))
story.append(p(
    "A focused builder-app plan for moving from site visit to clean bid, invoice packet, "
    "critical-path schedule, and lender-aware homeowner communication.",
    styles["CoverSub"],
))
story.append(Spacer(1, 0.25 * inch))

summary = [
    [p("Current Priority", styles["TableHeader"]), p("Make the bid tool feel like a real app for the contractor while keeping homeowner-facing outputs polished.", styles["Small"])],
    [p("Immediate Use Case", styles["TableHeader"]), p("After an A-grade site visit, capture client/contact name, price the job, collect the $10,000 preconstruction deposit, and generate invoice documents.", styles["Small"])],
    [p("Version 4 Goal", styles["TableHeader"]), p("Connect homeowner phone number, contractor approval, and SMS delivery so invoice summaries can be texted with payment links plus weather/schedule context.", styles["Small"])],
]
table = Table(summary, colWidths=[1.55 * inch, 5.55 * inch])
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#0F1F3D")),
    ("TEXTCOLOR", (0, 0), (0, -1), colors.white),
    ("BACKGROUND", (1, 0), (1, -1), colors.HexColor("#FAF7F2")),
    ("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#1C1917")),
    ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9.5),
    ("LEADING", (0, 0), (-1, -1), 12),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2D9CA")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 9),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
]))
story.append(table)

story.append(Spacer(1, 0.28 * inch))
story.append(p("What changed in this pass", styles["Section"]))
changes = [
    "Added homeowner/contact name directly to the top bid setup flow.",
    "Renamed the setup area to the Photovoltonic Bid Tool.",
    "Moved bid setup next to confidence scoring so readiness and client identity are visible together.",
    "Removed project JSON export buttons from the quick bid interface.",
    "Made draft saving clearer by saying drafts save locally to the homeowner folder.",
    "Made invoice printing more obvious with a red print action.",
    "Changed email flow to prepare Invoice 1 only, preserving the $10,000 preconstruction deposit context.",
    "Cleaned lender and contractor marketplace language on the homeowner site.",
    "Added a tiny-house browser icon for the site tab.",
]
for item in changes:
    story.append(p(f"- {item}", styles["Body"]))

story.append(PageBreak())
story.append(p("Roadmap For The Builder App", styles["Section"]))
story.append(p(
    "The static website can demonstrate the workflow, but reliable PDF attachments, payment links, SMS, permissions, and homeowner folders need the future app backend.",
    styles["Callout"],
))

rows = [
    [p("Feature", styles["TableHeader"]), p("Version 4 implementation plan", styles["TableHeader"]), p("Reason it matters", styles["TableHeader"])],
    [p("Individual invoice PDFs", styles["Small"]), p("Create one printable PDF per invoice. Invoice 1 is always the $10,000 preconstruction contract invoice.", styles["Small"]), p("Prevents the builder from sending the full bid packet when only one invoice is needed.", styles["Small"])],
    [p("Contractor approval gate", styles["Small"]), p("Require builder approval before any invoice email/SMS is sent to a homeowner.", styles["Small"]), p("Keeps communication professional and prevents accidental sends.", styles["Small"])],
    [p("SMS delivery", styles["Small"]), p("Store homeowner phone, delivery preference, and consent. Text approved invoice summaries with payment links.", styles["Small"]), p("Faster payment collection and better homeowner updates.", styles["Small"])],
    [p("Critical path linkage", styles["Small"]), p("Attach suggested send dates to 90-day schedule milestones and weather-driven recovery tasks.", styles["Small"]), p("Turns invoices into actionable business tasks, not loose reminders.", styles["Small"])],
    [p("Weekly Briefing", styles["Small"]), p("Read the schedule weekly, flag delay risks, write client briefings, and recommend recovery actions before the builder has to ask.", styles["Small"]), p("Gives the contractor a project-management rhythm without Primavera complexity.", styles["Small"])],
    [p("Lender workflow", styles["Small"]), p("Add lender contact path for homeowner prequalification and sponsored financing placements.", styles["Small"]), p("Creates monetization and helps families understand affordability earlier.", styles["Small"])],
]
roadmap = Table(rows, colWidths=[1.4 * inch, 3.25 * inch, 2.45 * inch], repeatRows=1)
roadmap.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F1F3D")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#FAF7F2")),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#FAF7F2"), colors.HexColor("#F0EBE1")]),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
    ("FONTSIZE", (0, 0), (-1, -1), 8.2),
    ("LEADING", (0, 0), (-1, -1), 10.5),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2D9CA")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story.append(roadmap)

story.append(Spacer(1, 0.2 * inch))
story.append(p("Open product decisions", styles["Section"]))
for item in [
    "Decide whether email sends a downloadable PDF link, a direct attachment, or both.",
    "Choose payment provider for deposit and draw payment links.",
    "Define homeowner consent language for SMS and payment reminders.",
    "Confirm whether Weekly Briefings are internal-only or homeowner-approved before delivery.",
]:
    story.append(p(f"- {item}", styles["Body"]))

story.append(PageBreak())
story.append(p("Step By Step Checklist", styles["CoverTitle"]))
story.append(p("Use this as the review page for Version 4 and the handoff list for the future app build.", styles["CoverSub"]))

checklist = [
    "Confirm Version 4 branch shows the tiny-house favicon in browser tabs.",
    "Open homeowner page and verify lender wording plus contractor marketplace cleanup.",
    "Open builder platform and confirm the Photovoltonic Bid Tool appears near Bid confidence.",
    "Enter contact/client name, bid title, model, square footage, and confidence grade.",
    "Add common COGS lines and verify totals, margin, and price per square foot update.",
    "Click Save Draft Locally and confirm the status explains where the draft was saved.",
    "Build invoices for current job and confirm Invoice 1 is exactly $10,000.",
    "Print invoice packet with the red print button.",
    "Use Email invoice 1 summary and verify only the preconstruction invoice content appears.",
    "Review Weekly Briefing copy and decide what should be internal versus homeowner-facing.",
    "Prioritize backend work for PDFs, payment links, SMS, homeowner phone, consent, and contractor approval.",
]
check_rows = [[p("Done", styles["TableHeader"]), p("Checklist item", styles["TableHeader"])]] + [["", p(item, styles["Small"])] for item in checklist]
check = Table(check_rows, colWidths=[0.7 * inch, 6.3 * inch])
check.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F1F3D")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
    ("FONTSIZE", (0, 0), (-1, -1), 9.4),
    ("LEADING", (0, 0), (-1, -1), 12),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2D9CA")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 8),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#FAF7F2")),
]))
story.append(check)

doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
print(OUT)
