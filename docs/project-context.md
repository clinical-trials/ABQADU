# ABQ ADU — combined project context

Updated September 30, 2026. This is the sanitized working requirements record for the recovered website and builder app. It consolidates the original task **ABQ ADU tiny house PM*** and the recovery task **Fix ABQ ADU tiny house issue**. It does not merge the conversations in the Codex interface.

## Sources and how to use this record

- Original task `019ee065-8d76-7ff2-b238-7cb9bf8bb758`: 345 available turns, June 19–September 28, 2026.
- Recovery task `01a0abe3-210a-7c31-89fe-1e6f4961f123`: 26 available turns, September 16–28, 2026.
- Private, fuller chronological history: `../COMBINED_PROJECT_HISTORY.md` relative to the repository root, outside this Git repository. It retains source turn IDs and coverage limitations; do not publish it.
- Operational state: `../PROJECT_RECOVERY.md`, plus the implementation and setup documents linked below.
- Baseline inspected for this consolidation: `c1a2890`, branch `codex/version-10-workflows`. Current fixes may supersede the snapshot below. Update status after verification.

The user's later corrections take precedence over earlier versions and assistant proposals. Old sample prices, schedule targets, regulatory notes, contact details and claims are historical inputs, not current externally verified facts. An earlier assistant saying “pushed,” “working” or “live” is historical reporting, not proof of the present deployment.

## Product decisions that carry forward

1. **Maintain both experiences.** The public homeowner website must open without sign-in. The builder app is a real saved-data workspace for jobs, bids, costs, invoices, schedules and field work. Keep builder-only materials takeoff, supplier quotes, COGS and internal risk details behind the builder boundary.
2. **Continue the existing complete app.** Preserve the current checkout, saved PostgreSQL data, Command Center JSON and recoverable browser drafts. Do not replace it with a sample, recreate the database, reset records or rerun all migrations to make a page load.
3. **Make field work fast.** Mobile portrait use is essential: one clear next action, short steps, readable cards, large touch targets and little horizontal scrolling. Keep desktop layouts polished too. Triage work that helps win projects, keep construction moving and reduce labor cost per day.
4. **Make homeowner decisions simple.** Ask about purpose, available space, bedrooms, budget, priorities and timing; allow unknown property constraints. Recommend the best one or two models. Contact information belongs near the end. Keep scoring and implementation explanations out of the consumer flow. Later simplification requests supersede the earlier bulky customization concept.
5. **Use the latest approved visual direction.** Preserve the original hero and model/site-plan imagery. The September 30 request removes the ADU Specialist accreditation block, Steven Miller and directory links, superseding earlier requests to include them. Use the new cute adobe-house favicon inspired by the existing stucco-home photo. Highlight Design as the mobile starting point and provide Text Ian/call contact choices.
6. **Keep models consistent.** Netherwood 1BR/2BR are 440/550 sf; the active builder catalog uses Altura 1BR/2BR at 576/650 sf, 750 Series at 750 sf, and Cromwell at 1,280 sf with 1.5 baths. Cromwell is a single-family home, not an ADU. User corrections removed Tierra Grande and merged Bryn Mawr into Netherwood 1BR. Historical Altura figures differ; reconcile against approved plans without silently rewriting saved projects.
7. **Make output and sharing work.** Homeowner recommendation/report printing must work on phone and desktop, include the chosen model image and business contact, and offer practical copy/email/text options. The requested destination is both homeowner and builder. Clearly distinguish an unsent draft or device composer from an actually delivered request. Every builder print button must produce the relevant professional document, with internal costs excluded from client copies.
8. **Use a complete bid workflow.** Client/contact details and best contact method/time; site visit; electrical and sewer review; setbacks/site plan; engineering review; model and area; fast COGS entry; consumer price and price per square foot; profit range; confidence grades including +/−; clear readiness labels; client preview; invoices. Use “sewer confirmation study” in homeowner language and keep technical pump details in internal assessment.
9. **Retain the commercial workflow.** First invoice is intended as $10,000 preconstruction, followed by a 50% contract stage and later draws based on the agreed total. Group documents per homeowner/job, show suggested dates and payment status, and preserve retry safety. Small totals and inconsistent schedules require review rather than misleading labels. Historical targets include a site visit within 24 hours, a bid within 30 hours of the visit, and a 90-day build; these are operating targets, not promises to customers.
10. **Keep supplier comparison central.** Compare Lowe’s, RAKS, Rio Grande and Muras PUR/SIP packages by scope, total, delivery, availability, lead time and quality; feed accepted figures into project COGS. Account for PUR/SIP labor and schedule savings and avoid double-counting included framing, sheathing or insulation. Price at the initial bid and again after contract signing. The long-term request includes plan-to-material takeoff, traceable drawing/detail references and eventual agent assistance.
11. **Connect weather to work decisions.** Numerical, attributed Albuquerque/job-location forecasts for the next four local calendar days, trade-specific guidance, explicit confirmation of days off, reversible holds and crew-message drafts. Rain, wind, heat/freeze, smoke/air quality and wildfire were requested; do not imply all are live merely because one feed works. Use current jurisdiction-specific code sources for Albuquerque, Santa Fe and other New Mexico authorities.
12. **Include local homeowner services.** Featured categories include Stucco, Yardwork and House cleaning, with the chosen category carried into the request.
13. **Provide real review links.** Identify whether a link is the local app, a public website, a source branch or a sample preview. A GitHub push is not a deployment. Keep visible version labels consistent when versioned copy is used.
14. **Put an actionable briefing in Project Helper.** The September 30 request adds a concise weekly-style briefing, spoken playback, four-day NWS planning, delay exposure, project controls and risk review. Use recorded work, financial inputs and recent activity; distinguish unavailable data from zero risk or paid invoices. Link a JSON job to a SQL schedule explicitly. Weather can suggest review or resequencing, but must not silently change dates or send crew messages.

## Architecture and deployment decisions

The user explicitly chose the direction “app.abqadu with Clerk + Supabase with login/team/permissions” in original turn `019f15c5-955b-76d2-9c05-07bc8df6a3fc`. Current code uses Express, PostgreSQL and a separate JSON store; Supabase, company tenancy and granular roles are not established by that request alone. The user explicitly selected **InvoiceShelf as the back-office estimate/invoice engine** in `019f807a-42fa-75f2-9ef1-c857efb8a0a0`; current export/adapter code is not evidence of a fully deployed InvoiceShelf system.

External deployment was requested repeatedly, including `019f6e04-5bcc-7e01-a395-ccaacc0079f0` and `019fe3c7-f53c-7922-a37f-41e2122d1ff4`. An earlier server folder was supplied, but later checks reported its host unreachable. There is no confirmed current public Express host, DNS control, complete production hostname or homeowner lead-delivery mailbox in the retrievable user text. “app.abqadu” is a product/subdomain direction, not proof of domain control. Squarespace was exploratory; Vercel/Netlify were options in a brainstorm, not a final exclusive choice.

The known historical public URL is [GitHub Pages](https://clinical-trials.github.io/ABQADU/). Its deployment configuration must be checked before publication. The September 27 recovery note reported native branch publishing from an old Version-10 commit, whereas the safe Actions workflow packages only public assets. Never publish the full repository, server data, environment files or private history as static content.

## Baseline implementation and verification

| Area | Implemented at baseline | Verification / remaining limits |
|---|---|---|
| Public website | Public allowlisted router, model/recommendation experience, services and request drafts | Local desktop/mobile checks recorded September 27. Public Pages still reported older content. Request preparation is not server delivery. |
| Full local builder | Explicit `npm run local`, normal saved stores, mobile field desk and older tools in Menu | Local loopback session and close/reopen verified. Development convenience is not hosted authentication. |
| Hosted authentication | Clerk session verification, approved staff allowlist, protected business APIs, stale-session safeguards | Accounts/configuration and hosted sign-in acceptance remain outstanding. All approved staff share one workspace. |
| Bids and billing | Model defaults, metrics/readiness, packets, invoice ledger/import, manual payments, Stripe checkout/webhook code | Branded PDF rendered and inspected. Native PDF viewer not fully checked by automation. No live payment performed; test checkout/webhook acceptance still needed. |
| InvoiceShelf | Explicit export adapter and reconciliation handling | Needs deployed service and real acceptance; no automatic Stripe-to-InvoiceShelf payment sync. |
| Contractor texts | Saved bid drafts, composer/copy actions, signed inbound Twilio handler, assignment and STOP/START handling | No real SMS sent/received in acceptance. Requires configured business number and public HTTPS webhook. |
| Weather | NWS default, four dated numerical cards, attribution, missing-data handling, holds | NWS live-read acceptance recorded September 21. WeatherKit optional and unverified without credentials; broader smoke/wildfire coverage not established. |
| Receipts and mileage | Manual records and receipt-text parsing | Photo OCR, email receipt import, automatic mileage capture and tax/report acceptance remain incomplete. |
| Schedule / field / risks / design | Existing React routes and persisted records | Baseline local navigation verified; this is not proof every legacy static tool has a current authenticated equivalent. |

Recorded September 27 baseline: 454 server tests, 185 client tests and 34 public checks passed; production build succeeded; database doctor found 22 required tables. These are dated results, not a substitute for checks after current edits. The saved Command Center jobs and templates were preserved; SQL portfolio/client/invoice lists were empty. No reset or blanket migration was performed.

### Subsequent changes verified separately

- The public JSON catalog now matches all six current model variants in the server catalog. The new-design template picker hides retired Casita Portal, Tierra Grande and Bryn Mawr templates and displays current Netherwood/Altura names for matching existing layouts. Direct legacy template lookup and saved designs retain their original IDs, dimensions and rooms. This does not invent layouts for catalog variants that lack SQL templates. Five route tests and two catalog tests cover the change; public artifact checks also passed.
- The current database doctor checks **24 required tables and 28 required billing columns**, including Stripe tables. This describes the diagnostic's coverage, not a new claim that a particular deployed database passed. The September 27 result above remains the historical 22-table check.
- A deterministic, read-only Project Helper briefing backend is implemented at `GET /api/project-helper/projects/:projectId/briefing`, with optional `trade` and explicit `schedule_project_id`. It reads the saved JSON job, current weather and an explicitly selected SQL schedule/risk register. It reports stale or unavailable weather, unfinished critical/late/upcoming work, potential weather overlap, a labeled hold-date-versus-float scenario, readiness, estimated gross profit, invoice-draft status and recent activity. Its short narration includes a dated weather concern and a concrete next action. It never claims a recalculated finish date, automatic delay, payment or message delivery. Missing stores are not created by briefing reads. The React workspace now presents the briefing near the top, with explicit Listen/Pause/Stop controls and a readable transcript. Forecast guidance is shared with crew controls; expiry withdraws old guidance and playback until refreshed.
- Focused September 30 verification passed **102 server tests across seven suites**, covering the briefing service/routes, catalog routes, existing weather calculation/providers and Command Center compatibility. Four public catalog/artifact checks also passed. This is not a full-suite or production acceptance claim.

## Launch priorities

**P0 — public-site release acceptance**

- Repair and verify every visible homeowner action: model recommendation, selected category, request preparation/delivery, report printing, phone links and recovery when a service fails. Do not display successful sending unless delivery actually occurred.
- Audit public output for private assets/records and stale copy; rebuild the packaged public bundle after source edits. Test portrait phone and desktop, including long content and denied/unavailable API paths.
- Confirm the public publishing source and authenticated deployment path, publish only the approved public artifact, and verify the actual public URL serves the new version. Keep a rollback checkpoint.

**P0 — before hosted builder use**

- Resolve reachable hosting and TLS; preserve and back up both data stores; configure persistent storage and restart behavior. Keep local-mode flags disabled on hosted production.
- Configure Clerk/approved staff and verify signed-in, unapproved and signed-out access.
- Complete test-mode Stripe checkout/webhook/retry acceptance and invoice balances before enabling paid workflows.
- Configure and test Twilio/InvoiceShelf/OCR separately. Clearly mark unavailable features.

**P1 — restore requirements that can otherwise disappear during recovery**

- Complete visible catalog acceptance against the corrected six variants, including the distinct Altura options and preserved city-plan references. The JSON catalog and new-template picker are corrected as described above; approved plan dimensions remain authoritative and legacy saved layouts remain intact.
- Confirm the homeowner-to-builder handoff, usable customer copies and project-scoped document organization.
- Check regulator contacts, jurisdiction/code assessment tracking and drawing-to-takeoff support that earlier work placed in the old static builder. A redirect from that page does not migrate those workflows.
- Keep two-stage supplier repricing, signed preconstruction/subcontractor agreements, document views/approval and change orders visible in the backlog until actually implemented and verified.
- Address scoped teams/permissions and deliberate migration decisions before offering independent contractor/company accounts.

**Later roadmap, explicitly retained**

User-supplied broader ideas include receipt email import, automatic mileage, QuickBooks sync, financing prequalification, document reminders and reporting, customer reviews without review gating, offline field work, high-quality interactive interior/exterior visualization, lender/contractor placements, rental-income/ROI planning, smart-home referrals and a New Mexico property-tax appeal business concept. These are not launch claims or proof of working integrations.

## Operating references

- [Local access and restart](local-workspace.md)
- [Private workspace and payment setup](private-workspace-setup.md)
- [Contractor field/Twilio setup](contractor-field-setup.md)
- [NWS setup](nws-weather-setup.md) and [optional Apple WeatherKit](apple-weather-setup.md)
- [Public-site release notes](homeowner-services-release.md)
- [Full platform deployment](version-10-platform-deployment.md)
- [Version 10 specification](superpowers/specs/2026-08-22-version10-builder-operating-system-design.md)
- [InvoiceShelf plan](superpowers/plans/2026-07-20-invoiceshelf-back-office-engine.md)
- [Entrepreneurial roadmap](v2-marketing-entrepreneurial-roadmap.md)

Coverage: pagination reached the end of both histories available during September 28 consolidation. Twelve turns returned no items; 85 user-containing turns returned no assistant final response; 304 older original-task timestamps were absent. Attachments, images and PDFs were referenced but not re-imported by this consolidation. Some September 21 account/configuration decisions survive only in the recovery note because the corresponding turns returned no message text. Subsequent September 28–30 work is outside that historical export; current status above includes separately verified changes and the latest delegated user requirements.


## September 30 homeowner and contractor additions

- Lighthouse Credit Union is linked as an educational ADU loan example. Its current page limits this product to NH, MA, ME and VT; the site explicitly directs Albuquerque homeowners to ask their lender about New Mexico options. This is not an established local lending partnership.
- Contact leads to Text Ian and Call Ian at the existing published business number. Device messaging remains a reviewed, manual send.
- The working app has append-only project activity, the latest five entries and older-history pagination. Entries record verified actor IDs and changed fields; text drafts and invoice drafts are never treated as sent messages or payments. Notes support idempotent retries and browser dictation with review before saving. SQL payment history remains in the billing ledger.
- The old file-based platform is retained to protect browser drafts and now points visibly to the real localhost app. Its prototype records have not been silently migrated.
- In-app weather planning alerts update when opening or refreshing the briefing. There is no scheduled background SMS alert service. Twilio configuration and deliberate delivery acceptance are still required. Contractors can explicitly save a connection between a Command Center job and an existing SQL schedule. Future briefings reuse it, and the direct schedule link opens that exact project, including inactive projects. The separate records have not been automatically merged or migrated.


Final September 30 local verification: 527 backend tests (39 suites), 214 React tests (20 suites), and 52 public tests passed; production build and public packaging succeeded. Browser review checked live NWS data, mobile navigation/contact, audio controls and unsaved-note project switching. PostgreSQL doctor confirmed 24 tables and 28 billing columns. Production sign-in, provider delivery, hosting and public publishing remain unverified as described above.


### Saved schedule connections and crew updates — September 30 continuation

- Project Helper now saves the job-to-schedule connection through a dedicated authenticated endpoint. Version checks prevent concurrent overwrites; durable request receipts make uncertain retries safe, and link/unlink actions appear in project activity. Generic job saves cannot erase connections. Database lookup has a five-second deadline and runs outside the job-save queue.
- Refreshing a briefing refreshes its saved connection too. Unsaved selections and pending saves remain intact; explicit reload retrieves the current connection. Missing schedules and unavailable data remain visible without substituting a different project.
- Prepare crew update creates an editable, dated four-day draft with source and check time. Forecast refreshes preserve edits and offer deliberate replacement. Copying never claims sending; drafts are temporary and the UI asks contractors to copy them before switching projects.
- The portfolio aggregates activities and risks separately, fixing multiplied counts when a project has several of each. Stored health thresholds remain unchanged.
- Continuation verification: **546 backend tests / 41 suites, 246 React tests / 22 suites, and 52 public tests passed**. Production build succeeded. Browser review checked live NWS data, draft retention after refresh, and phone controls at 390 px without overflow or console errors. Persistence, concurrent writers and inactive schedule navigation were verified with isolated fixtures; no customer records were created or edited.


### Virtual executive team — September 30 CFO release

The owner requested a virtual CFO as the start of a company executive team. The private `/executive` workspace now provides a CFO financial review and spoken briefing, with operations and sales cards leading to existing tools. It uses recorded invoice/payment evidence, estimates job gross margins, highlights data gaps and offers a temporary thirteen-week cash scenario. These are advisory workspaces; there is no autonomous executive agent or new granular staff role. See [the role and data design](virtual-executive-team.md).

Known Stripe test payments and uncertain payment provenance do not support collection recommendations. Source outages stay unknown, draft invoices are separate from issued balances, and gross profit estimates are before overhead/tax. Bank cash, payables and payroll are not connected. The cash scenario requires explicit opening cash and weekly flows; collection delays move receipts later while outflows retain their timing. Inputs/results are temporary, and edits invalidate earlier projections. No actual payments, account connections or financial-record writes were made for acceptance.

### Preconstruction agreement packet — next continuation

The `/preconstruction` tool now prepares three clearly separated draft documents: a preconstruction services agreement, a preliminary construction estimate and a draft invoice for the entire preconstruction fee. Saved job information prefills the form; the proposed $10,000 fee remains editable and unapproved. Contractor legal identity/license, scope, payment/termination terms, fee credit, tax and notice review remain explicit inputs. The request to identify the first job and confirm its fee has not yet been answered; no customer agreement or ledger invoice was created during development.

Server-owned immutable revisions preserve the reviewed terms independently of later job edits. Saves use version checks and durable request identities; retries cannot create duplicate revisions or restore older terms. Printing retrieves an exact saved version using private authenticated transport. The PDF marks every page draft/unsigned/no payment due and includes signature spaces reserved for a final reviewed copy. It does not supply approved CID disclosure or transaction-specific cancellation forms, collect a signature, issue an invoice or charge a customer. See [preconstruction packet workflow and source limitations](preconstruction-packet.md).

Verification: 638 backend tests across 47 suites, 309 React tests across 25 suites, 52 public-site tests and the production build passed. The new tool was checked at 390 px and 1280 px without horizontal overflow; job autofill and unsaved tax edits were checked without writing customer data. A four-page fictional PDF was generated and every page visually reviewed outside the repository.
