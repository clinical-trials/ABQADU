# Version 10 Builder Operating System Design

## Goal

Version 10 turns the Version 9 demo into a builder operating system prototype that can be used during real weekly work. The primary user is the contractor/builder. The system should help the builder move from site visit to estimate, compare COGS across suppliers and building methods, produce professional estimate/invoice artifacts, and protect the 90-day critical path with weather and crew communication.

The homeowner website and ADU wizard remain important, but Version 10 focuses on the builder backend and deployable app.

## Success Criteria

- Visible platform copy says `Version 10`.
- The builder Command Center has a clear daily triage layout on mobile.
- A project can move through: lead/site visit, estimate, supplier bidout, invoice, weather/crew message, activity log.
- Model square footage and base assumptions are centralized so bid math, COGS, invoices, and supplier packages use the same data.
- Supplier comparison can evaluate Lowe's, RAKS, Rio Grande, SIP/PUR panels, and conventional build packages.
- Weather Delay Assessor produces crew-action messages tied to affected work categories.
- The app has a documented deployment path for the full platform server, not only the static homeowner site.
- Tests and build pass before any Version 10 commit is marked ready.

## Scope

Version 10 includes:

- Builder Command Center improvements.
- Estimate and invoice workflow refinements.
- Supplier/materials bidout workflow.
- SIP/PUR versus conventional build comparison.
- Weather and critical path crew messaging.
- Deployment documentation and scripts for the platform app.
- Version 10 visible labeling across platform and relevant static pages.

Version 10 does not include:

- Full Clerk authentication.
- Full Stripe production payment processing.
- Full Twilio production SMS sending for all workflows.
- Full InvoiceShelf deployment.
- Full automated blueprint parsing.

Those stay as integration-ready seams unless credentials and hosting details are available.

## Core Workflow

1. **Project Intake**
   - Client name, phone, email, address, best contact method, best contact time.
   - Model selection auto-fills square footage and default assumptions.
   - Site visit status, utility review status, sewer confirmation status, setbacks/site plan status.

2. **Estimate Builder**
   - Starts with model, square footage, target customer price, COGS range, and confidence grade.
   - Shows dollars per square foot for customer price and estimated COGS.
   - Uses readiness labels: Ready to send, Needs utility review, Needs engineering, Missing site data, Needs supplier comparison.
   - Keeps `Invoice 1: $10,000 Preconstruction` unmistakable.

3. **Supplier Bidout**
   - Supplier comparator includes Lowe's, RAKS, Rio Grande, SIP/PUR panel supplier, and custom vendor.
   - Each quote stores package scope, quoted total, delivery requirement, lead time, and next action.
   - Material categories include lumber, sheetrock, mud, roofing, house wrap, windows/doors, cabinets, appliances, fixtures, lighting, flooring, and panelized shell.
   - A `Send to COGS` action rolls selected supplier totals into the active project estimate.

4. **SIP/PUR vs Conventional Comparison**
   - Conventional build separates lumber/framing, sheathing, insulation, exterior framing, and labor.
   - SIP/PUR package can show higher upfront material cost but lower labor and schedule risk.
   - Comparison should show estimated total COGS, labor days, schedule effect, and gross profit impact.

5. **Invoices and Client View**
   - Estimate can produce staged invoice rows.
   - First invoice is always $10,000 preconstruction.
   - Later invoices can be calculated from the total contract amount.
   - Client view simulation should open a clean preview modal showing what the homeowner would receive.
   - Print/export should produce a professional document with ABQ ADU branding and contact info.

6. **Weather and Critical Path**
   - Weather checks use project ZIP code.
   - Risks are mapped to work categories: roofing, trenching, concrete, delivery, exterior finish, inspection, crew productivity.
   - Builder can log a weather risk and generate text-ready messages to affected crews.
   - Weather activity appears in the project timeline.

7. **Deployment**
   - Platform deployment must include both React build output and Express API server.
   - Static-only GitHub Pages is insufficient for Version 10 builder tools.
   - Deployment docs must distinguish local test URL, LAN URL, and public external URL.
   - Required environment variables must be documented.

## Data Model Additions

Extend the existing JSON-backed command center store before introducing a database migration:

- `model_catalog`
  - `id`, `name`, `sqft`, `bedrooms`, `bathrooms`, `type`, `base_price`, `default_cogs_low`, `default_cogs_high`
- `clients`
  - `id`, `name`, `phone`, `email`, `preferred_contact`, `best_contact_time`, `notes`
- `estimate_sections`
  - `project_id`, `section`, `items[]`, `subtotal`
- `supplier_packages`
  - `project_id`, `supplier`, `category`, `scope`, `quoted_total`, `lead_time`, `delivery`, `status`
- `crew_messages`
  - `project_id`, `trade`, `reason`, `body`, `status`, `created_at`
- `client_views`
  - `document_id`, `type`, `viewed_at`, `status`

## UI Design Principles

- Mobile first. The builder should be able to use the tool from an iPhone at a job site.
- Daily triage first. Show next actions, project risk, and money impact before detailed tables.
- Tables become cards on phone.
- Buttons should state the job outcome: `Send to COGS`, `Create $10k Invoice`, `Text Crew`, `Preview Client View`.
- Every generated artifact should be printable or previewable.
- Avoid exposing implementation details or future integrations as if they are complete.

## Testing

Required checks for Version 10:

- Server tests for command center store changes.
- Static UI checks for Version 10 labels and core button text.
- Client build.
- Manual local endpoint checks:
  - `/health`
  - `/command-center`
  - `/api/command-center`
  - `/api/weather/forecast?zip=87106`

## Deployment Requirements

The current documented server (`10.0.0.166:3001`) is a LAN host and may not be reachable externally. Version 10 must include:

- A platform deployment guide for the Express server.
- A script or documented command sequence for:
  - building the React client,
  - copying the platform app to the server,
  - installing server dependencies,
  - restarting the Node process or systemd service,
  - verifying health and command center routes.
- A clear statement that the external review link requires a reachable public host or tunnel.

## Open Questions

- What is the current reachable public server/domain for the Version 10 platform app?
- Should Version 10 use the existing `ahmad` server account, or a new host?
- Should the deploy target be a separate app from the homeowner intake server, or should both run behind the same Express process?
- Should Twilio live SMS be enabled in Version 10 if credentials are available, or remain text-link based for demo safety?
