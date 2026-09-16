# Version 10 workflow continuation

Continue the approved Version 10 design from commit 9456572 in an isolated checkout. Existing source remains in the older Codex folder; active development now uses this repository in the ABQ ADU task folder.

This iteration closes existing workflow gaps:

- [x] Serialize saves, retain local edits, report failure and support retry.
- [x] Select an active project explicitly and scope supplier, payment, receipt, mileage, and weather actions to it.
- [x] Connect the existing client-preview API to an accessible homeowner document and isolate print output from internal financial data.
- [x] Make site-readiness checks editable and consistent with the backend.
- [x] Verify behavior with client/server tests, production build, desktop/mobile browser checks, and an independent review.

Ownership: persistence hook and tests (safe_saving agent); client packet component and tests (client_packet agent); backend guards and tests (workflow_audit agent); integration and review (parent).

Baseline: 10 server suites / 40 tests pass. Three new UI integration tests fail on the absent active-project selector and missing disabled state, reproducing the workflow gap.

Scope decision: preserve Version 10, existing data format and financial draw calculations. Live external integrations remain dependent on deployment configuration. Do not send SMS or create payment links as part of tests.

## Verification and review

- Client: 3 suites / 27 tests passing, including persistence races, failed saves/retry, draft recovery after navigation, selected-project actions, readiness persistence, dialog accessibility and homeowner data isolation.
- Server: 12 suites / 71 tests passing, including receipt concurrency/project attribution, readiness defaults, weather project identity, and preview field restrictions.
- Production client build passes. Command-center and deployment static checks pass. Whitespace checks pass.
- Local `/health` and `/command-center` return HTTP 200. API reports Version 10. Mackland preview has four draws totaling $185,250 and only `price_per_sqft` in metrics.
- Browser checks: 1440px desktop has two columns and compact 91px summary cards; 390px phone viewport has no horizontal page overflow; 366px client packet fits the phone viewport.
- Browser save/reload check preserved a changed contact-time field; the test value was restored to Morning afterward. Browser console reported no errors.
- Independent review found and resolved OCR/queued-save races, draft loss on internal navigation, unclear legacy receipt attribution, stale OCR state, and incomplete legacy readiness. Scoped re-review found no remaining important defect.
- Print CSS and component tests verify document isolation; the native printer dialog was not used and no document was physically printed.

## Continuing work

Run `npm start` in `platform/server`; local review is `http://localhost:4000/command-center`. Rebuild changes with `npm run build` in `platform/client`.

Remaining product work includes wiring the supplier comparator to its project-based bidout API and replacing static SIP/PUR comparison examples with live project calculations. Public hosting and live integrations are still separate work; this continuation does not deploy or send messages.
