# Virtual executive team — first working release

The owner asked for a virtual CFO as the foundation of a company executive team. The intended outcome is a short, evidence-based review that helps the owner identify collection work, weak job estimates and upcoming cash needs. Continue the existing ABQ ADU application and preserve both data stores.

## Roles and authority

- **Owner / CEO:** sets priorities, reviews assumptions and approves commitments.
- **CFO:** reviews recorded invoice balances, estimated job gross margins, missing financial evidence and user-entered cash scenarios. Produces a concise written and spoken briefing.
- **Operations:** existing Project Helper, construction schedule, crew weather and risk tools. Dedicated company-wide operations reasoning is future work.
- **Sales:** existing customer estimates and trade bids. Dedicated sales forecasting and follow-up automation are future work.

The executive desk also includes the [weekly contract-to-$10,000 scorecard](preconstruction-scorecard.md): manually recorded signing and full-deposit receipt times, a 20-hour goal, a 15-hour stretch target, eight weeks of comparisons, and open-job clocks. These operational milestones are separate from ledger payments and bank cash. They feed the CFO's spoken briefing.

These are advisory workspaces, not autonomous employees or new authentication roles. The existing approved-staff access boundary applies. This release does not send messages, change payment records, move money, change schedules or connect bank accounts.

The separate [owner goals and business-plan section](owner-goals.md) has a stricter owner allowlist for personal planning. Its private runtime file is separate from shared job data, activity and CFO narration. General staff access never grants access to the personal plan.

## Current implementation scope

Add `/executive` to the private app and workspace menu. The CFO is the initial full desk; the other role cards identify their responsibilities and link to existing tools. Make the first view readable on phones, with current decisions and missing evidence ahead of expandable details. Reuse the existing speech playback controls for the financial briefing.

`GET /api/executive/cfo/briefing` reads the saved Command Center file without creating starter data, and reads invoice/payment information from PostgreSQL. Return independent availability states and exact integer cents. A failed source is unknown, never an empty ledger or a zero balance. SQL reads have deadlines; the report does not hold the JSON write queue.

Keep issued invoice balances separate from drafts. Payment records, not invoice labels or InvoiceShelf status, provide the ledger evidence. Identify Stripe test payments through checkout-attempt provenance. Invoices affected by test, unknown online provenance or invalid payment data require review and are excluded from collectible/overdue recommendations. Recorded manual or live payments still do not establish a bank balance. The current billing system uses USD; do not add foreign currencies together or infer exchange rates.

Calculate estimated job gross-profit ranges only when bid and cost values form a valid, complete range. State the number of priced jobs included. These figures exclude company overhead, tax, financing and unrecorded costs. Receipt drafts, supplier quotes and scheduling cost fields do not establish actual expense or net profit. Do not infer financial relationships from names or a schedule link.

`POST /api/executive/cfo/cash-scenario` is a stateless calculator: opening available cash, expected weekly inflow, total weekly outflow, and a collection delay of zero to four weeks. All dollar inputs are required; explicit zero is valid. Calculate thirteen dated weeks in integer cents. Delay moves weekly receipts later while outflows remain on time; receipts beyond the window are disclosed. Show the lowest balance, closing balance and first negative week, with a chart and accessible weekly values. Inputs and results are temporary, not saved or bank connected. Editing an input invalidates the prior result, including an in-flight response.

## Verification

Cover exact money arithmetic, missing/corrupt values, draft/issued separation, test/live/unknown payment provenance, partial source failures, aggregate join correctness, overdue calendar dates, delayed receipts beyond the horizon and year/DST boundaries. Verify the real auth boundary, no-store headers, sanitized errors and read-only behavior. In the client verify source failures, malformed responses, late responses after edits/unmount/session changes, audio cleanup and mobile layout. Use only isolated fixtures for financial writes in tests; do not create customer records for acceptance.

Bank reconciliation, accounts payable, payroll, taxes, retained company cash plans, general-ledger accounting, scheduled executive agents and granular finance-only permissions remain later work. A development-branch push does not deploy the application.

## Verified release checkpoint

September 30, 2026: 614 backend tests (45 suites), 286 React tests (24 suites) and 52 public checks passed. The production client build succeeded. PostgreSQL finance acceptance used a disposable schema and ran the report in a read-only transaction. Mobile review at 390 px checked the scenario chart, 49–50 px fields, withdrawal of old results after edits and no page overflow. Desktop layout was checked at 1280 px. The operations card scrolled to Project Helper after its saved data loaded, and the executive workspace remained accessible through Menu. No console errors were observed.

A temporary browser scenario of $10,000 opening cash, $8,000 weekly receipts, $10,000 weekly outflows and a two-week receipt delay correctly produced the first negative week at week two, -$32,000 closing cash at week thirteen and $16,000 of receipts beyond the horizon. The page was then reloaded to clear all test inputs. No customer financial records were created or edited.
