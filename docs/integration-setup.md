# Integration setup — September 21, 2026

The integration indicators check whether server settings are present. They do not contact providers or prove that credentials work. Treat a configured service as **configured, not verified**. Some features also need implementation before they can be used in production.

Keep credentials in private server configuration, never in browser code, screenshots, chat, or committed files. The variable names below match `platform/server/.env.example`; preserve existing configuration when adding them. Restart the API process after changing its environment, then refresh status. Refreshing status does not send a message or create a payment.

## 1. Hosting and real sign-in

The full builder app needs an Express host, PostgreSQL, and persistent storage for its separate Command Center JSON file. Static GitHub Pages can serve the public website but cannot run these APIs. Set `PORT` and `DATABASE_URL` for the intended host and follow [the deployment guide](version-10-platform-deployment.md). Keep development private until login and access controls are implemented.

Clerk settings: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWKS_URL`.

**Current:** the Clerk status endpoint checks the first two settings and can decode a token payload. It does not authenticate anyone. `CLERK_JWKS_URL` is listed in the example configuration but is not currently used.

**Still to build:** sign-in/sign-out UI, session-token handling, server verification of signatures and token claims, and authorization on protected API routes. Adding Clerk keys alone does not protect project data or payment/SMS actions. Verify that signed-out and unauthorized users cannot access protected routes before public release.

## 2. Invoices and payments

### InvoiceShelf

Settings: `INVOICESHELF_BASE_URL`, `INVOICESHELF_API_TOKEN`, `INVOICESHELF_COMPANY_ID`; optional `INVOICESHELF_TIMEOUT_MS`.

**Current:** adapters and API routes can create customers, estimates and invoices, convert estimates, and refresh invoice status. The UI exposes estimate creation and invoice status refresh. A running InvoiceShelf instance and compatible API configuration are required; a status badge does not confirm either.

**Still to complete:** verify the installed InvoiceShelf API and field mappings; expose the missing customer/invoice synchronization steps; handle retries without creating duplicates; and connect payment synchronization. Payment mapping helpers exist but are not called by the current payment workflow. Test with disposable records before using real invoices.

**Two separate data stores:** Command Center projects and invoice drafts live in JSON. Portfolio, Clients, Bids and Invoices use PostgreSQL, and the InvoiceShelf routes use those PostgreSQL records. Connecting InvoiceShelf does not automatically export Command Center drafts. That connection requires an explicit mapping/import workflow; preserve both stores.

### Stripe

Settings: `STRIPE_SECRET_KEY`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`, and `STRIPE_WEBHOOK_SECRET`.

**Current:** the first three settings enable creation of Stripe Checkout Sessions. Command Center requests a $10,000 preconstruction checkout link for the selected project. Creating a link does not record a payment.

**Still to build:** store the checkout-to-invoice/project association, implement and verify payment webhooks, reject duplicate events, and update the appropriate payment ledger. `STRIPE_WEBHOOK_SECRET` is listed in the example configuration but is not currently used. Use test-mode credentials and a test checkout first; verify payment recording before enabling live collection.

## 3. Optional messaging and receipt photos

### Twilio

Settings: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.

**Current:** the server can submit an outbound SMS and record an activity after provider acceptance. The regular **Text** link opens the device's messaging app and does not require Twilio.

**Next:** configure an approved sender and test with an explicitly authorized recipient. Provider acceptance is not delivery confirmation. Delivery callbacks and incoming-reply handling still need implementation if those capabilities are wanted.

### Receipt OCR

Setting: `OCR_SPACE_API_KEY`.

**Current:** pasted receipt text is parsed locally without an OCR key. The backend also accepts an image URL or base64 image for OCR.space, but the current UI submits text only.

**Still to build for photos:** file/camera selection, image validation and upload, and a review step for extracted receipt details. Then test a sample receipt with the configured provider. Review vendor, date and amount before using extracted data for accounting.

## What can be used now

Local project work, manual receipt entry, pasted-text parsing, and device text drafts do not require connecting all five providers. Enable only the services needed for the next workflow, and distinguish missing settings from unfinished implementation.

## September 21 local checkpoint

The Command Center now shows expandable guidance for all five services. Settings present are labeled **Credentials added · untested**. Missing settings show **Setup needed**; request failures show **Status unavailable** and clear stale settings so payment/SMS controls are disabled. The receipt tool is labeled **Receipt Text Entry**, and the Clerk button checks settings without claiming to log anyone in.

Verification: 60 client tests passed across 7 suites, the production build compiled, and two targeted website checks passed. The setup-panel tests and build passed again after the final InvoiceShelf wording correction. Both local previews and integration status returned HTTP 200; the read-only database doctor confirmed all 22 required tables. Browser checks verified accordion interaction, the final instructions, and no page overflow at phone and desktop widths. No provider credentials, external messages, live payments, or public deployment were involved.
