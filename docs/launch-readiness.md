# Launch preparation — September 30, 2026

The working history is consolidated in [project-context.md](project-context.md). The complete private history remains outside Git at `../COMBINED_PROJECT_HISTORY.md`. This record concerns the existing website and Express application, not a replacement demo.

## Current release work

The launch review found and corrected these concrete issues:

- A blocked homeowner report popup replaced the entire page, losing unsaved request fields.
- Homeowner contact text was rendered as HTML in the saved design summary.
- An HTTP 200 response, including invalid JSON, could be described as a delivered design request.
- Keyboard focus could remain behind the design modal.
- The deployment copy could overwrite or delete the live server's `.env`.
- The database diagnostic could report readiness with missing billing tables or columns.
- The legacy live-text action did not consult saved contact opt-outs.
- Retired models remained in a separate public catalog and the new-design template picker.

The public copy also contained a placeholder license number, unsupported client testimonials and completion counts, an incorrect seven-design count, internal version/planning language, and blanket property-eligibility claims. Those were removed or corrected while preserving the original hero, models and service-request flow. The September 30 request also removed the accreditation/directory content and added direct Text Ian contact, a regional-disclosure lender example, and the adobe favicon.

The City-plan copy now links to the [official construction-plan guidance](https://www.cabq.gov/planning/accessory-dwelling-unit/free-casita-construction-plans) and property review links to the [City's ADU guidance](https://www.cabq.gov/planning/accessory-dwelling-unit), reviewed September 28. City plans do not remove the need for site and permit review. Rates, loan approval, rental income and approval dates are not promised by this website.

## Contractor tools added September 30

The real app now has a weekly Project Helper with short audio playback, four-day weather guidance, a persistent connection to the matching construction schedule, risk review and labeled weather/float exposure scenarios. An editable crew-update draft includes four dated forecast entries and attribution; refreshes preserve the contractor’s edits until deliberately replaced. Durable project activity records the latest five saved actions and provides older history, reviewed notes, dictation and prompt templates. Expired weather is withdrawn; notes are not sent automatically. Payment evidence remains in the SQL billing ledger.

The new `/executive` company workspace adds the first virtual CFO review: issued invoice balances, collection exceptions, estimated job margins, accounting gaps, spoken briefing and a temporary thirteen-week cash scenario. Stripe test/unresolved payment histories are separated, missing sources stay unknown and recorded payments do not establish bank cash. The operations and sales roles open existing tools; dedicated autonomous executive agents, bank reconciliation, payables/payroll ledgers and retained cash plans remain future work.

These tools are authenticated backend features. The earlier static `platform.html` file preserves its browser drafts and links to the working app; it is not the production backend. In-app alerts do not establish automatic scheduled SMS delivery.

## Required before public application launch

1. Confirm the reachable production server/provider and domain. An older task named an existing server folder, but its public address/access is not established. The user previously requested the `app.abqadu` direction with Clerk and Supabase; the current implementation is Express/PostgreSQL with a separate JSON store. Confirm any hosted database choice before changing saved data.
2. Preserve the production `.env`, PostgreSQL database and Command Center JSON store. Set an explicit persistent `COMMAND_CENTER_STORE_PATH` on the host and keep recoverable backups. The deployment example only preserves the standard server data folder; custom storage must remain outside the copied release tree or be explicitly protected.
3. Configure matching Clerk keys, approved staff IDs and trusted origins privately. Use normal hosted startup, not local workspace mode. Verify approved, unapproved and signed-out behavior on the final HTTPS origin.
4. Verify the intended enabled integrations individually: Stripe test checkout and signed webhook retries; Twilio inbound signatures, contact matching and opt-outs; InvoiceShelf reconciliation. Configuration status alone does not prove delivery or payment acceptance. Keep unavailable integrations clearly labeled.
5. Confirm the homeowner contact path. The existing request form prepares an unsent text/copy/download draft. Automatic web delivery is not configured. A future endpoint must return an explicit accepted receipt before the design UI reports success; email-to-self is not a builder delivery channel. Do not claim a lead reached the office without testing the actual destination.
6. Verify the public deployment source. Read-only checks September 28 still found an older native GitHub Pages `Version-10` deployment. The current Actions workflow packages only public assets and now tests that packaging before uploading. Confirm GitHub Actions as the Pages source and select the reviewed release. Never upload the full repository or private history.

## Existing boundaries to keep visible

Command Center jobs are saved separately from PostgreSQL scheduling/portfolio projects. Empty scheduling lists do not prove jobs were lost. A contractor can explicitly link an existing schedule to a saved job, but the app does not automatically convert or merge those records. Saved links have version checks, safe retries and activity history; a missing schedule is not silently replaced. Company tenancy, granular subcontractor permissions, automatic request dispatch, e-signatures and several roadmap items remain future work. See the combined context rather than presenting old proposals as completed features.

Use the [public release instructions](homeowner-services-release.md) and [platform deployment guide](version-10-platform-deployment.md) for commands. Record verified test/build results and the published commit here before calling this release live.


## Verification checkpoint — September 30

- Full backend suite: **614 tests, 45 suites passed**, including isolated billing and portfolio fixtures, private access, activity/link concurrency and retries, database lookup deadlines, forecast staleness, schedule exposure, CFO payment provenance and exact-cent cash scenarios.
- Full React suite: **286 tests, 24 suites passed**. Production build succeeded.
- Public website suite: **52 tests passed**; packaged public-asset exclusion checks passed.
- Database doctor: all **24 required tables and 28 billing columns** present locally. No migration/reset was run.
- Browser review: highlighted mobile Design menu, real Text Ian/call links, live NWS numbers, shared briefing/crew forecast, audio controls and notes preserved across project switches. Phone layout checked at 390 px without horizontal overflow. The continuation also verified editable crew drafts survive briefing refresh and saved-connection controls meet phone touch sizes. The CFO release also verified temporary cash calculations, stale-result withdrawal, blank inputs after reload, operations navigation after loading and the executive menu entry. No browser console errors were observed. Microphone and actual SMS/payment delivery were not invoked.

These are local release checks. The live-host configuration and publishing requirements above remain outstanding. The GitHub release branch is `codex/version-10-workflows`; a push does not make the hosted application live.
