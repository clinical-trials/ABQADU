from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
)


OUT = "output/pdf/abq-adu-version7-builder-estimates-direction.pdf"


def p(text, style):
    return Paragraph(text, style)


def bullets(items, style):
    story = []
    for item in items:
        story.append(Paragraph(f"- {item}", style))
    return story


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica-Bold", 9)
    canvas.setFillColor(colors.HexColor("#0F1F3D"))
    canvas.drawString(0.55 * inch, 0.42 * inch, "ABQ ADU - Version 7 Builder Estimates Direction")
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.HexColor("#6B625A"))
    canvas.drawRightString(7.95 * inch, 0.42 * inch, f"Page {doc.page}")
    canvas.restoreState()


def build():
    doc = SimpleDocTemplate(
        OUT,
        pagesize=letter,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.62 * inch,
        bottomMargin=0.65 * inch,
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "TitleABQ",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=26,
        leading=28,
        textColor=colors.HexColor("#0F1F3D"),
        spaceAfter=8,
    )
    h = ParagraphStyle(
        "HeadingABQ",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=17,
        textColor=colors.HexColor("#8B5A35"),
        spaceBefore=8,
        spaceAfter=5,
    )
    body = ParagraphStyle(
        "BodyABQ",
        parent=styles["BodyText"],
        fontSize=9.8,
        leading=13,
        textColor=colors.HexColor("#1C1917"),
        spaceAfter=5,
    )
    small = ParagraphStyle(
        "SmallABQ",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#3F3A34"),
    )

    story = []
    story.append(p("ABQ ADU Version 7", title))
    story.append(p("Builder Estimate-to-Invoice Direction", h))
    story.append(
        p(
            "Version 7 turns the builder backend into a phone-first estimating tool: professional estimates in minutes, conversion to invoices in one click, mobile-safe PDF/print output, and a clear path toward real delivery, view tracking, payments, QuickBooks sync, financing, change orders, reporting, and reviews.",
            body,
        )
    )
    story.append(Spacer(1, 8))

    story.append(p("MVP Build Sequence", h))
    data = [
        [p("Phase", small), p("Build", small), p("Why it matters", small)],
        [p("1", small), p("Estimates, invoices, clients, PDF/email-ready delivery", small), p("Usable product and fastest sales value.", small)],
        [p("2", small), p("Stripe payments, view tracking, reminders", small), p("Monetization and contractor visibility.", small)],
        [p("3", small), p("QuickBooks, change orders, reporting, financing, reviews", small), p("Retention, upsell, and revenue expansion.", small)],
    ]
    table = Table(data, colWidths=[0.55 * inch, 3.1 * inch, 3.65 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F1F3D")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D8C8AD")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FBF7EF")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(table)

    story.append(p("Version 7 Prototype Scope", h))
    story.extend(
        bullets(
            [
                "Add a builder-only Estimates & Invoices tab in the existing platform.",
                "Create a local estimate model with client fields, status, line items, tax, discounts, handling, insurance, terms, and notes.",
                "Add one-tap catalog items for common ADU estimate lines.",
                "Convert estimate to invoice with due date and invoice status.",
                "Generate a professional mobile-safe print/PDF document with logo, bill-to, bill-from, itemized table, totals, notes, and signature lines.",
                "Simulate sent/viewed/approved/declined activity locally; document that real open tracking requires hosted links and backend event logging.",
            ],
            body,
        )
    )

    story.append(p("Core Data Model", h))
    data = [
        [p("Entity", small), p("Important fields", small)],
        [p("Company", small), p("name, logo, address, phone, email, license, insurance, social links", small)],
        [p("Client", small), p("name, company, phone, email, billing address, job-site address, notes", small)],
        [p("Estimate", small), p("company_id, client_id, number, expiry_date, status, tax_rate, discount, terms", small)],
        [p("LineItem", small), p("estimate_id, section, item_part, description, quantity, unit_price, taxable", small)],
        [p("Invoice", small), p("source_estimate_id, invoice_no, due_date, payment_terms, late_fee, payment_status", small)],
        [p("ActivityLog", small), p("document_id, event_type, timestamp, device/context", small)],
        [p("Catalog", small), p("company_id, default item lines for one-tap reuse", small)],
    ]
    table = Table(data, colWidths=[1.35 * inch, 5.95 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#C4954A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0F1F3D")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D8C8AD")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FBF7EF")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(table)

    story.append(PageBreak())
    story.append(p("Backend Requirements For The Real App", h))
    story.extend(
        bullets(
            [
                "Server-side PDF rendering with Puppeteer, WeasyPrint, or react-pdf so estimates, invoices, and change orders share one document service.",
                "Hosted client-facing document links; document view events are more reliable than email open pixels.",
                "Transactional email through Postmark, SendGrid, SES, or similar.",
                "Stripe Connect for payments; do not build payment processing directly.",
                "Webhook reconciliation for paid, partially paid, failed, and refunded invoice states.",
                "Scheduled reminders for unpaid invoices and weekly sales digests.",
                "QuickBooks Online push sync first; bidirectional sync comes later because duplicate detection and tax mapping are complex.",
                "Offline-first mobile/PWA behavior so contractors can work where reception is weak.",
                "Multi-tenancy from day one: every row scoped to company/account.",
            ],
            body,
        )
    )

    story.append(p("Strategic Takeaway", h))
    story.append(
        p(
            "The estimating tool drives adoption because it helps contractors win work on the spot. The business model comes later from payment processing fees, financing referrals, premium document features, QuickBooks sync, reporting, and change orders. Version 7 should make the estimate beautiful, fast, and printable first.",
            body,
        )
    )
    story.append(p("Version 7 Acceptance Checklist", h))
    story.extend(
        bullets(
            [
                "Builder can create an estimate from a phone in under five minutes.",
                "Builder can add common ADU line items in one tap.",
                "Estimate converts to invoice without re-entering client or line-item data.",
                "Printed/PDF document looks professional enough to send to a homeowner.",
                "Static prototype clearly labels simulated tracking versus future real backend tracking.",
            ],
            body,
        )
    )

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    build()
