# Version 8 Builder Estimates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a builder-backend Version 8 prototype that lets a contractor create professional estimates quickly, convert them to invoices, print/mobile-save client-ready documents, and track local send/view activity.

**Architecture:** Keep the homeowner ADU wizard stable. Add a builder-only `Estimates & Invoices` tab to `platform.html` using the current static/localStorage architecture. The prototype models estimate, invoice, client, line items, catalog, status, and activity log locally; real delivery, payments, QuickBooks, reminders, and view tracking are documented as backend requirements.

**Tech Stack:** Static HTML/CSS/JavaScript, localStorage prototype state, mobile-safe print document shell, ReportLab PDF direction document, existing Node static tests.

## Global Constraints

- All Version 8 work is builder backend / webapp only.
- Update visible builder platform text to Version 8.
- Build estimates first; invoices convert from approved/sent estimates.
- Mobile contractor speed matters more than exhaustive enterprise settings.
- Real open/view tracking requires hosted links and backend events; the static prototype may simulate status and activity logs only.
- Payments must use Stripe or another payment processor; do not build card/ACH processing directly.
- Keep homeowner-facing page stable except shared version text if already present.

---

### Task 1: Direction PDF

**Files:**
- Create: `work/create_version8_builder_estimates_pdf.py`
- Create: `output/pdf/abq-adu-version8-builder-estimates-direction.pdf`

**Interfaces:**
- Produces: a polished PDF roadmap for review.

- [x] Generate a concise PDF with MVP, data model, phases, backend requirements, and Version 8 prototype scope.
- [x] Verify text extraction contains "Version 8" and "Estimate-to-Invoice".

### Task 2: Builder Navigation And Version Text

**Files:**
- Modify: `platform.html`
- Test: `tests/platform-bid-app.test.js`

**Interfaces:**
- Produces: new tab `data-tab="estimates"` and mobile quick link to the estimating tool.

- [x] Add `Estimates & Invoices` tab before `Bids & Invoicing`.
- [x] Update builder platform badges from Version 6 to Version 8.
- [x] Add tests for Version 8 and tab presence.

### Task 3: Estimate Builder UI

**Files:**
- Modify: `platform.html`
- Test: `tests/platform-bid-app.test.js`

**Interfaces:**
- Produces: DOM ids `estimate-client`, `estimate-hero-title`, `estimate-lines`, `estimate-total`, `estimate-activity`.

- [x] Add a phone-first estimate builder section with client fields, line item library, estimate/invoice status, totals, terms, and notes.
- [x] Include company logo placeholder and ABQ ADU branding.
- [x] Include signature/date fields on the printed document.

### Task 4: Estimate State And Actions

**Files:**
- Modify: `platform.html`
- Test: `tests/platform-bid-app.test.js`

**Interfaces:**
- Produces: functions `renderEstimateTool()`, `addEstimateCatalogItem(key)`, `convertEstimateToInvoice()`, `printEstimateDocument()`, `markEstimateViewed()`.

- [x] Store estimate state in localStorage.
- [x] Add one-tap catalog items.
- [x] Calculate subtotal, discount, tax, handling, insurance, and total.
- [x] Convert estimate to invoice with due date and status.
- [x] Simulate sent/viewed/approved/declined activity log for Version 8 static prototype.

### Task 5: Mobile-Safe Print

**Files:**
- Modify: `platform.html`
- Test: `tests/platform-bid-app.test.js`

**Interfaces:**
- Uses: existing `openBuilderPrintDocument(title, subtitle, bodyHtml, fallbackPanelId, fallbackClass)`.
- Produces: `buildEstimateInvoiceDocument()`.

- [x] Print estimate and invoice documents through the standalone mobile-safe print shell.
- [x] Include logo, company info, bill-to, bill-from, document metadata, itemized rows, totals, terms, and signature lines.

### Task 6: Verification And Push

**Files:**
- Modify: `tests/platform-bid-app.test.js`

**Interfaces:**
- Produces: passing local tests and pushed `version8` branch.

- [x] Run `node tests/platform-bid-app.test.js`.
- [x] Parse inline scripts in `index.html` and `platform.html`.
- [ ] Push to GitHub branch `version8`.
