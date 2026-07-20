# Version 7.2: ADU Cost Estimator Plan

## Goal

Create a builder-facing ADU cost estimator that borrows the speed and simplicity of modern estimator tools while staying specialized for ABQ ADU projects.

The estimator should help a contractor move from site visit to credible quote quickly:

1. Select homeowner, address, model, and square footage.
2. Add common ADU construction line items in one tap.
3. Compare materials and labor paths.
4. Separate internal COGS from homeowner-facing price.
5. Produce a professional estimate.
6. Sync the customer-facing estimate to InvoiceShelf.
7. Capture job expenses with receipt scanning and mileage tracking.

## Product Positioning

Cost Estimator for ADU Construction Projects.

AI-powered estimator gives builders reliable quotes for construction projects. Save time, avoid costly mistakes, plan faster, and win more business.

For ABQ ADU, the differentiator is that the estimator already understands ADU-specific constraints:

- Known ABQ ADU models and square footage.
- Typical homeowner ADU max of 750 square feet.
- Electrical panel, extra meter, and 220V/50A review.
- Sewer confirmation study.
- Permitting and fast-track permitting.
- Engineering triggers for large openings.
- Supplier paths including Lowe's, RAKS, Rio Grande, and Muras PUR/SIP panels.
- Customer-facing bid price versus internal COGS and profit margin.
- Receipt, expense, and mileage records that help reconcile job profitability and tax reporting.

## Open Source Reference

Repository reviewed:

- `datadrivenconstruction/OpenConstructionEstimate-DDC-CWICR`
- GitHub: https://github.com/datadrivenconstruction/OpenConstructionEstimate-DDC-CWICR

Use this project as a reference for estimating architecture, schema vocabulary, search patterns, and work-item organization.

Important licensing guardrail:

- Do not copy or ship their data into ABQ ADU production without confirming commercial licensing.
- Model our internal schema after the useful structure, but build an ABQ ADU-owned cost catalog.
- Code may be more permissive than data, but the data license appears non-commercial, so production data should be locally owned or separately licensed.

## Builder Workflow

### 1. Field Estimate Mode

Builder opens the platform after a site visit and starts a fast estimate:

- Client name.
- Phone.
- Email.
- Project address.
- Model.
- Square footage.
- Bid confidence grade.
- Readiness status.

Model selection should auto-fill square footage when possible.

### 2. One-Tap Estimate Bundles

Add reusable estimate bundles:

- ADU base construction at consumer price per square foot.
- Preconstruction contract: `$10,000`.
- City permitting and fast-track permitting.
- Electrical panel / extra meter allowance.
- Sewer confirmation study.
- Foundation / slab.
- Conventional framing.
- PUR/SIP panel shell.
- Roofing.
- Windows and doors.
- Sheetrock and mud.
- Plumbing and appliance package.
- Electrical package.
- HVAC / mini split.
- Cabinets.
- Countertops.
- Flooring.
- Tile.
- Lighting.

Each bundle should create editable line items.

### 3. Internal COGS Catalog

Create an internal estimator catalog with:

- Category.
- Work item name.
- Unit.
- Default quantity.
- Default unit cost.
- Labor hours.
- Supplier source.
- Material source.
- Customer-facing flag.
- Internal-only flag.
- Confidence level.
- Notes.

Internal COGS, supplier comparison, labor assumptions, and margin calculations must not appear on homeowner-facing PDFs or InvoiceShelf documents.

### 4. Supplier And Build Method Comparison

Create a comparison tool for:

- Conventional stick build.
- Lowe's Pro package.
- RAKS openings/hardware package.
- Rio Grande building package.
- Muras PUR/SIP panel package.

For each path, calculate:

- Material cost.
- Labor estimate.
- Delivery cost.
- Schedule effect.
- Risk flags.
- Gross margin.
- Confidence grade.

PUR/SIP panels should be modeled as a higher up-front package that can replace exterior sheathing, framing, insulation, and some field labor/time.

### 5. OpenConstructionEstimate-Inspired Search

Add a search interface for internal construction cost items:

Examples:

- `slab 12x24 footing`
- `2x4 framing`
- `sheetrock`
- `mud`
- `windows`
- `mini split`
- `water heater`
- `dishwasher`
- `rough opening`
- `headers jack studs king studs`

Search results should add line items to the current estimate or COGS worksheet.

### 6. Plan/Quote Intake

Future input sources:

- Supplier PDFs.
- Shop drawings.
- Plan sheets.
- Lowe's Pro quote.
- RAKS quote.
- Muras PUR/SIP package.
- Photos from site visit.

Version 7.2 should start with manual line-item entry and one-tap bundles. PDF/photo parsing can become Version 8.

### 7. InvoiceShelf Integration

ABQ ADU remains the builder cockpit.

InvoiceShelf remains the back-office document engine for:

- Customer-facing estimate records.
- Client views.
- Invoice records.
- Status sync.
- Payment tracking.

Only customer-facing estimate and invoice lines should sync to InvoiceShelf.

### 8. Receipt Scanner

Positioning:

> Ditch the Shoebox of Receipts.

Builder value:

- Scan and organize receipts in seconds.
- Auto-import email receipts.
- Assign expenses to a homeowner project, supplier, category, and estimate line.
- Generate reports that make expense tracking and taxes easier.
- Compare actual job expenses against estimated COGS.

Core fields:

- Project.
- Supplier.
- Receipt date.
- Total.
- Tax.
- Payment method.
- Category.
- Photo/PDF attachment.
- Reimbursable flag.
- COGS category.
- Notes.
- Export status.

Version 7.2 implementation should start with manual upload and manual category confirmation. Future versions can add OCR, email inbox import, and vendor matching.

Customer-facing guardrail:

- Receipt images, supplier receipts, and internal expense notes are builder-only records.
- Receipts should never sync to homeowner PDFs or InvoiceShelf customer documents unless explicitly marked reimbursable and approved by the builder.

### 9. Mileage Tracker

Positioning:

> Capture Every Mile.

Builder value:

- Track mileage by project, site visit, supplier pickup, delivery coordination, and permitting errands.
- Generate tax-ready mileage reports.
- Preserve job-level profitability by assigning travel cost to the right project.
- Help the builder see hidden costs behind bids.

Core fields:

- Driver.
- Project.
- Start location.
- End location.
- Date.
- Purpose.
- Miles.
- IRS rate used.
- Deduction estimate.
- Billable/reimbursable flag.
- Notes.

Version 7.2 should start with manual mobile entry:

- Quick buttons: Site visit, supplier pickup, permit office, client meeting, subcontractor meeting.
- Optional round-trip toggle.
- Optional project assignment.
- Exportable CSV/PDF report.

Future versions can add automatic trip detection from a mobile app, but the web prototype should avoid background location tracking until privacy, permissions, and mobile app architecture are ready.

## Recommended Version 7.2 Build Sequence

### Sprint 1: Estimator Catalog Foundation

- Add local construction item catalog data structure.
- Add starter ADU cost catalog.
- Add test that internal COGS lines are excluded from customer-facing estimates.

### Sprint 2: Fast Mobile Estimate Entry

- Add "ADU Cost Estimator" card to builder platform.
- Add model + square-foot auto-fill.
- Add one-tap line item bundles.
- Add live total, cost per square foot, COGS, margin, and confidence grade.

### Sprint 3: Supplier Comparison

- Add supplier quote comparator to estimator workflow.
- Compare Lowe's, RAKS, Rio Grande, and Muras PUR/SIP paths.
- Add "send selected path to COGS" button.

### Sprint 4: Customer Document Output

- Convert selected customer-facing lines into branded estimate.
- Keep internal notes private.
- Sync clean estimate to InvoiceShelf.
- Preserve local print/PDF fallback.

### Sprint 5: Planning For Future Automation

- Define import path for supplier PDFs and plan sheets.
- Define future agent task for blueprint-to-material takeoff.
- Define review queue for items that require human builder approval.

### Sprint 6: Receipt Scanner And Mileage Tracker

- Add "Receipt Scanner" card to the builder platform.
- Add upload/manual-entry prototype for job receipts.
- Add project/category tagging for receipt expenses.
- Add "Mileage Tracker" card to the builder platform.
- Add manual mileage log with quick trip purposes.
- Add job profitability rollup that compares estimate, COGS, receipts, mileage, and gross margin.
- Add exportable tax-ready reports for receipts and mileage.

## Success Criteria

- Builder can make a credible site-visit estimate from a phone in under 10 minutes.
- Builder can see price per square foot immediately.
- Builder can compare supplier/build paths before finalizing COGS.
- Homeowner-facing documents look professional and do not expose internal COGS.
- InvoiceShelf receives clean customer-facing estimates only.
- ABQ ADU keeps the local print/PDF fallback working when InvoiceShelf is offline.
- Builder can attach receipts and mileage to projects without exposing them to homeowners.
- Builder can export receipt and mileage reports for tax/accounting review.

## Non-Goals For Version 7.2

- Do not build full AI plan parsing yet.
- Do not automatically order materials.
- Do not expose supplier comparison to homeowners.
- Do not copy non-commercial open-source cost data into production.
- Do not replace InvoiceShelf; integrate with it.
- Do not build automatic background mileage tracking in the static website.
- Do not auto-read contractor email inboxes until OAuth, permissions, and security review are designed.
