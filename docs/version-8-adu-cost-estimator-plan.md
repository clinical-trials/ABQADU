# Version 8: ADU Cost Estimator Plan

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

## Builder Operating Principle

The builder platform must be mobile-friendly and extremely easy for a busy builder to use in the field. The first screen should triage the most important information first: bid readiness, client status, weather delays, supplier quotes, unpaid invoices, and critical-path blockers.

The business focus is to maximize dollars per day through faster new-project bids, active follow-up, and continuous builds, while minimizing labor cost per day by reducing idle crews, missed handoffs, unnecessary back-and-forth, and delayed subcontractor coordination.

Fast group texting is a core workflow. Weather delays, inspection changes, supplier updates, schedule recovery, and critical-path issues should be easy to send to the right crews quickly so the build keeps moving.

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

Version 8 should start with manual line-item entry and one-tap bundles. PDF/photo parsing can move into a later release after the mobile estimating workflow is stable.

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

Version 8 implementation should start with manual upload and manual category confirmation. Future versions can add OCR, email inbox import, and vendor matching.

Customer-facing guardrail:

- Receipt images, supplier receipts, and internal expense notes are builder-only records.
- Receipts should never sync to homeowner PDFs or InvoiceShelf customer documents unless explicitly marked reimbursable and approved by the builder.

Technical reference:

- `alfianlosari/AIReceiptScanner`
- GitHub: https://github.com/alfianlosari/AIReceiptScanner

Useful ideas from this repo:

- Use a vision-capable model to read a receipt image and return structured receipt data.
- Preserve a scan status workflow: idle, picking image, scanning, success, and failure.
- Support camera, photo library, and file picker entry points in future native mobile versions.
- Show scanned receipt results as editable structured data before saving.
- Allow copy/export as JSON for debugging and accounting review.

Important architecture note:

- This repo is Swift-first and useful for a future iOS/mobile app.
- ABQ ADU Version 8 should stay web-first: upload receipt image/PDF, extract structured data server-side, show an editable review screen, then save to project expenses.
- OpenAI API keys must never live in the browser or a homeowner-facing page.
- The server should own the scan request, model call, validation, and storage.

Suggested extracted receipt schema:

- Vendor.
- Transaction date.
- Receipt total.
- Tax.
- Payment method.
- Line items.
- Confidence score.
- Raw extracted JSON.
- Original attachment URL.
- Project assignment.
- COGS category.
- Builder-approved flag.

Version 8 scan flow:

1. Builder uploads or photographs a receipt.
2. Server sends the image/PDF to the receipt extraction service.
3. System returns structured receipt fields and line items.
4. Builder reviews and corrects the extraction.
5. Builder assigns the receipt to a project and COGS category.
6. Receipt becomes part of actual job-cost reporting and tax/accounting export.

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

Version 8 should start with manual mobile entry:

- Quick buttons: Site visit, supplier pickup, permit office, client meeting, subcontractor meeting.
- Optional round-trip toggle.
- Optional project assignment.
- Exportable CSV/PDF report.

Future versions can add automatic trip detection from a mobile app, but the web prototype should avoid background location tracking until privacy, permissions, and mobile app architecture are ready.

Technical reference:

- `hargata/lubelog`
- GitHub: https://github.com/hargata/lubelog

Useful ideas from this repo:

- Web-first vehicle logbook architecture rather than native-only tracking.
- Vehicle records tied to odometer readings, service history, fuel/mileage entries, expenses, reminders, and documents.
- Report/export mindset that can support tax and accounting review.
- Self-hosted app pattern that can inform an internal builder back-office module.

Important adaptation for ABQ ADU:

- Do not build a generic vehicle maintenance app inside the builder platform.
- Use the LubeLogger pattern for contractor mileage and project-cost attribution.
- Replace personal vehicle maintenance focus with job-linked trips: site visit, supplier pickup, permit office, client meeting, subcontractor meeting, delivery coordination, and warranty/service visit.
- Connect vehicle/trip expenses to project COGS and tax-ready mileage reports.

Suggested mileage tracker schema:

- Vehicle.
- Driver.
- Project.
- Trip purpose.
- Start odometer.
- End odometer.
- Miles.
- Date.
- Start location.
- End location.
- IRS mileage rate.
- Deduction estimate.
- Fuel/parking/toll expense.
- Receipt attachment.
- Notes.
- Export status.

Version 8 mileage flow:

1. Builder selects vehicle and project.
2. Builder taps a trip purpose such as site visit or supplier pickup.
3. Builder enters odometer start/end or total miles.
4. System calculates deduction estimate using the selected mileage rate.
5. Builder can attach fuel, parking, or toll receipts.
6. Mileage rolls into project profitability and tax/accounting exports.
7. Future mobile app can add automatic trip detection after privacy and permissions are designed.

## Recommended Version 8 Build Sequence

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
- Add scan-status states: image selected, scanning, review needed, saved, failed.
- Add editable extracted receipt fields before save.
- Add "Mileage Tracker" card to the builder platform.
- Add manual mileage log with quick trip purposes.
- Add vehicle records and odometer-based trip entry.
- Add mileage deduction estimate and project attribution.
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

## Non-Goals For Version 8

- Do not build full AI plan parsing yet.
- Do not automatically order materials.
- Do not expose supplier comparison to homeowners.
- Do not copy non-commercial open-source cost data into production.
- Do not replace InvoiceShelf; integrate with it.
- Do not build automatic background mileage tracking in the static website.
- Do not auto-read contractor email inboxes until OAuth, permissions, and security review are designed.
