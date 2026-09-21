# Integration setup

The service badges check configuration presence; they do not contact providers or certify a working connection. **Credentials added · untested** is not a provider verification result. See [private workspace and billing setup](private-workspace-setup.md) for current configuration and acceptance steps.

## What is implemented

- **Clerk:** the React sign-in screen and server access boundary use the supported SDKs. Every business API requires a verified session from this Clerk application and a user ID in the staff allowlist. Missing configuration locks the workspace. Staff share one workspace; homeowner and crew-specific permissions are not implemented.
- **Invoices:** saved Command Center drafts can be imported into PostgreSQL without overwriting existing financial records. Imports map the JSON project to a separate SQL client and preserve a billing snapshot. Current balances live in Invoices, not in planning draft packets.
- **Stripe:** checkout uses a saved invoice's outstanding USD balance. The backend persists attempts and provider idempotency keys, verifies signed webhook bytes, retrieves the session, checks identity/amount/currency/mode, and records payments transactionally with duplicate protection. Test and live credentials/modes must match. The public return page never records a payment.
- **InvoiceShelf:** Clients and Invoices expose explicit creation controls. Customer, company and configured currency must agree on USD before exports; money is sent in integer cents. A durable creation reservation prevents blind retries after an uncertain response. Remote status is stored separately from local paid/balance. Actual instance compatibility still requires account testing. Stripe payments are not automatically copied into InvoiceShelf's ledger.

## What still needs account setup or further work

Add Clerk and Stripe credentials privately in `platform/server/.env`, approve the intended staff IDs, configure exact allowed origins, and restart the server. Register/forward the Stripe webhook and complete test-mode sign-in/payment acceptance checks before live use. The user confirmed existing Clerk and Stripe accounts and will supply their configuration privately.

InvoiceShelf is optional for the local invoice/payment workflow and requires a running instance, company, token, USD currency ID, and installed invoice/estimate templates. Review an uncertain creation against the remote instance before changing its reservation. No external records, messages, or payments are created merely by refreshing setup status.

- **Twilio:** outbound SMS is implemented; account/sender configuration and an authorized recipient test are required. Delivery callbacks and incoming replies remain future work. The ordinary Text link still opens the device's messaging app.
- **OCR.space:** pasted receipt text is parsed locally; manual entry works after builder sign-in. Photo selection, validation/upload and a review flow still need building for the existing backend image adapter.
- **Apple Weather:** the weather panel uses server-side WeatherKit with the official mark and data-source link. Add private Apple signing credentials and ZIP-to-location settings, then perform a live forecast check. See [Apple Weather setup](apple-weather-setup.md). ABQ ADU calculates the construction planning estimates; earlier weather records retain their original provider.
- **Hosting:** the full app needs Express, PostgreSQL and persistent Command Center file storage. GitHub Pages serves the homeowner site only. The public bundle now excludes server files, configuration, backups and the old static builder tool.

Secrets belong only in private configuration, never in browser code, screenshots, chat or committed files. No public deployment or real provider acceptance test has been performed by this implementation.
