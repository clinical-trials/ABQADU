# Weekly contract-to-deposit scorecard

The owner requested a competitive weekly measure of hours to the preconstruction contract and $10,000 deposit, targeting 15–20 hours. The current definition is **elapsed clock hours from a signed preconstruction agreement to receipt of the full $10,000 deposit**. A clarification about staff effort versus elapsed time remains pending. Staff effort from inquiry through collection is a different measure and is not inferred from this clock.

The scorecard appears first on the executive desk at `/executive#preconstruction-cycle`, with links from the agreement workspace and legacy Estimates screen. It also contributes to the CFO's written and spoken briefing.

## Recording milestones

Approved staff select a saved job and record the agreement-signing timestamp, the timestamp when the full $10,000 was received, and a short evidence reference. The second timestamp stays blank until the full amount has actually been received. A check-received milestone does not establish that a bank has cleared the check. The form identifies the device time zone; the server stores exact UTC timestamps. “Use current time” fills the form and does not save it.

This operational record does not sign an agreement, create an invoice, post a ledger payment, verify a bank deposit, or send a message. Draft documents, PDF generation, invoice labels and the billing ledger's date-only payment field cannot start or finish an hourly clock. No real milestones are seeded for existing or demonstration jobs.

Each correction appends a revision with the verified actor, saved time and evidence. Expected versions prevent concurrent overwrites. Durable request identities make exact retries safe. Generic job saves and resets preserve the history. Existing completed records continue contributing to weekly totals if their job is removed; the editor only lists currently saved jobs. Explicit date corrections can restate a prior week's statistics, so these are recomputed operational views, not frozen accounting closes.

## Weekly competition

- **Goal:** at most 20 elapsed hours. **Stretch:** at most 15 hours. Faster completion counts toward both; there is no minimum of 15 hours.
- Completed cycles enter the Monday–Sunday week of the recorded deposit receipt in Albuquerque's `America/Denver` time zone. The current week is labeled week to date; the prior week is a full calendar week. UTC elapsed duration remains correct across daylight-saving changes.
- Median, fastest completion, completion count and the percentage within 20 hours describe completed cycles. Zero completed cycles yield unknown durations and percentages, never a zero-hour victory.
- The comparison is against the company's previous week, with eight weeks of history. A positive improvement means fewer median hours. Comparisons require completed samples in both weeks and show their counts.
- Open jobs show elapsed time separately, including those beyond 20 hours. They are excluded from completed-cycle medians and are not treated as successful completions.

The weekly update is available inside the app and its audio briefing. Automatic scheduled email or SMS delivery is not enabled by this feature.

## Interfaces and scope

`GET /api/executive/preconstruction-cycle` returns the weekly report and current job milestones. `PUT /api/executive/preconstruction-cycle/projects/:id` accepts a request UUID, expected revision and milestone fields. Both use the existing staff boundary and private, no-store responses. The server validates dates, chronology, evidence, job identity and request replay before one serialized JSON update. The CFO reads the same stored snapshot for its report; a milestone-source failure leaves other finance sections available.

The fixed $10,000 operational target does not override an editable agreement fee. Jobs with different deposit terms need a separately defined target before this KPI can represent them.

## Release verification

721 backend tests across 52 suites passed, including the configured isolated PostgreSQL integration checks. 397 React tests across 27 suites and 57 public-site checks passed. The final copy adjustment passed all 47 focused scorecard/executive tests, and the production build succeeded. Independent review cleared the recorded-history and browser save/recovery flows.

Browser acceptance used a separate temporary workspace with fictional jobs. Three completed cycles of 12, 18 and 24 hours produced an 18-hour median, 12-hour fastest time and 66.7% within target; a prior 36-hour median produced an 18-hour improvement. Recording a fourth, slower completion updated the median to 21 hours and the target rate to 50%, persisted its revision and refreshed the CFO. At 390 px the editor had no horizontal page overflow; inputs were 50 px tall and buttons 48 px. No browser errors were observed. Real job milestones and ledger payments were not written during acceptance.
