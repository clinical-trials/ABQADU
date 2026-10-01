# Private owner goals and future business plan

The executive desk includes a private planning section at `/executive#owner-plan`. It records an annual financial target, debt-payoff intentions and future property/home goals. The dashboard presents the same saved goals as a downloadable text business-plan draft, plus a weekly review rhythm. This first release is a read-only presentation of the recorded plan.

## Meaning of the figures

An annual financial target must identify its basis: company revenue, company net profit or personal income. An unconfirmed basis stays visibly unconfirmed. Invoice totals, customer deposits and estimated job margins do not establish progress toward a personal income target.

Debt goals keep the desired balance separate from the owner-reported balance and its reporting date. The date records the owner's planning input; it does not establish a lender statement, current payoff quote or bank verification. Unknown budgets and target dates remain unset. This view does not produce repayment schedules, financing recommendations, property valuations, transfers or payment entries.

## Private storage and access

- `platform/server/data/owner-plan.json` is the default private source. `EXECUTIVE_OWNER_PLAN_PATH` can select another private runtime file. Keep the file on persistent private storage and restrict filesystem permissions; it must not be committed to source control or packaged with public assets.
- Personal targets, debts, locations and planning notes must never be copied into client code, tests, public documentation, the shared Command Center store, project activity or the shared CFO narration.
- `GET /api/executive/owner-plan` checks access before reading the file. The existing workspace authentication and origin rules still apply.
- In hosted mode, `EXECUTIVE_OWNER_USER_IDS` explicitly identifies owner accounts. They must also be approved workspace staff in `CLERK_ALLOWED_USER_IDS`. An absent or invalid owner policy denies owner-plan access. General staff access does not imply owner access.
- Valid local development mode permits its existing `local-owner` session. This is the trusted local workspace, not a separate identity for each person using the Mac.
- A non-owner receives a concealed 404 and no private file read. This preserves approved staff sessions: the ordinary authentication helper revokes sessions on 403, so owner-role denial must not use that status. Missing owner files also return 404; invalid or unavailable data returns a sanitized 503.
- Responses are private and not cached. The client clears prior private content on refresh, errors and account changes, rejects malformed reports, and only permits downloading the currently verified plan.

The source schema has a version, update timestamp, USD currency, vision, bounded goal list and weekly-review list. Each goal includes its kind, title, target amount, reported debt balance/date where relevant, financial basis, intended date, planning status, next step and notes. Amounts are integer cents; unrelated amounts stay null. Text exports are generated from the validated source. No shared-workspace write route or ledger integration is involved.

## Continuing the plan

Refine the private plan with the owner as definitions, dates and budgets become known. Preserve unknowns rather than filling them with estimates. Monthly performance tracking, confirmed lender balances, funding scenarios and editing the plan through the app can be added as separate reviewed capabilities. Hosted setup must supply the private data file and explicit owner identities; a code push does not publish personal planning data.

## Release verification

The implementation passed 765 backend tests across 53 suites, including configured isolated PostgreSQL integrations; 436 client tests across 29 suites; and 57 public-site checks. The production client build completed successfully. Focused coverage verifies owner authorization before file access, bounded and validated private reads, sanitized failures, session changes, stale responses, download cleanup, and approved staff retaining workspace access when the owner endpoint returns 404.

Local browser review confirmed all four goal cards, the expanded business plan and download action, the initial deep link, and layouts at 390 px and 320 px without horizontal overflow. Controls have 48 px minimum height and no browser errors were recorded. A separate temporary local session verified anonymous denial, authorized private/no-store responses, and exclusion of owner goal titles from the shared CFO response; that test session was revoked. Actual financial records were not changed.
