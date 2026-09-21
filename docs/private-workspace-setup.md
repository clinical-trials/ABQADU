# Private workspace and billing setup

This release adds Clerk sign-in and server-enforced access, imported invoice records, invoice-specific Stripe checkout, verified payment recording, and explicit InvoiceShelf creation controls. Provider acceptance testing still requires your account configuration. Nothing is publicly deployed by this change.

## 1. Configure your existing Clerk application

Edit `platform/server/.env` privately. Preserve its existing database and other settings; use `.env.example` for variable names, not as a replacement for the whole file.

- `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: matching keys from the same Clerk application and environment.
- `CLERK_ALLOWED_USER_IDS`: comma-separated Clerk user IDs, such as `user_…`, for staff who may access this shared workspace. Use the Users area of your Clerk dashboard to find the ID of each approved account. A newly registered account does not receive workspace access automatically.
- `APP_ORIGINS`: exact app origins, including scheme and port, without a path or trailing slash. Local defaults are `http://localhost:4000,http://127.0.0.1:4000`. A public host must use HTTPS.
- Optional `CLERK_JWT_KEY`: your Clerk PEM public verification key. Leave it empty to use the SDK's normal key retrieval. This is not a secret key.

Restart the server after changing configuration. The browser loads the publishable key from the server; no client secret or client rebuild is required for a key change. Open `/command-center`, sign in with an approved account, then test a signed-out window and an unapproved account. Neither should reveal project records. Missing/invalid configuration produces a locked setup screen; there is no development bypass.

All approved staff currently share the same workspace permissions. Homeowner accounts, crew-specific permissions, and multiple isolated businesses are not implemented. Existing legacy drafts are preserved but not silently assigned to a signed-in account. Staff drafts and queued saves are isolated by identity; signing out locks the UI and invalidates pending work.

## 2. Configure Stripe in test mode first

Set these privately in `platform/server/.env`:

```dotenv
STRIPE_MODE=test
STRIPE_SECRET_KEY=your_test_secret_key
STRIPE_WEBHOOK_SECRET=your_endpoint_signing_secret
STRIPE_SUCCESS_URL=http://localhost:4000/payment-return
STRIPE_CANCEL_URL=http://localhost:4000/payment-return?result=cancelled
```

Register or forward Stripe checkout events to:

```text
POST /api/billing/stripe/webhook
```

Handle `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`. For local development, an authenticated Stripe CLI can forward events to `http://localhost:4000/api/billing/stripe/webhook`; use the signing secret for that forwarding endpoint. A public Stripe endpoint and return pages require the final HTTPS host. Configure those in your own account; don't place secret keys in chat, browser code, or source control.

The webhook verifies the original signed request, retrieves the checkout from Stripe, checks its saved invoice association, amount, currency and mode, and records paid sessions transactionally. Event IDs, checkout sessions and PaymentIntent IDs are deduplicated. A checkout return page does not mark an invoice paid. `STRIPE_MODE` defaults to `test`; live keys require explicit `STRIPE_MODE=live` and matching production configuration.

## 3. Use the invoice workflow

1. In Command Center, select the project and create/save its invoice drafts. Review their amounts.
2. Choose **Create invoices from saved drafts**. This snapshots the saved drafts into PostgreSQL and creates a mapped client. Repeating the import returns the same invoices. Changing an already-imported draft produces a conflict; it does not overwrite a financial record.
3. Open **Invoices and payments**. Choose **Create payment link** for the invoice to be collected. The server uses its outstanding balance; no browser-supplied amount is accepted. Creating the link does not send it to anyone.
4. Complete a Stripe test checkout in your account. Refresh invoices and verify one payment and the expected balance. Repeat a webhook delivery to confirm the balance remains unchanged.
5. An open/pending checkout blocks invoice changes and separate manual payments. Resolve or expire it in Stripe and refresh its link to reconcile state. A creation attempt with an uncertain response retains its original idempotency key; attempts older than 23 hours require review rather than a new blind retry.

Manual payment retries retain their original request ID, amount and method in user-scoped session storage across closing the form, refreshing the page and signing back in. Choose **Resume payment** to retry safely. When browser storage is unavailable, a warning explains that the retry survives only in the current open page. An unreadable saved attempt requires ledger review. **Start a different payment** loads the ledger and requires an explicit review before replacing an unresolved attempt; use this only for a different real payment.

PostgreSQL is the payment ledger. Command Center JSON remains the source of planning drafts; payment totals are not written back into those drafts or client preview packets. Read current balances in Invoices.

The separate **Bids** workflow creates its own draw schedule from saved bid terms. Repeating that action returns the original schedule. A changed bid or an older schedule without a saved source snapshot requires review before another schedule can be created; it is not silently billed again.

## 4. Optional InvoiceShelf portal

Configure `INVOICESHELF_BASE_URL`, `INVOICESHELF_API_TOKEN`, `INVOICESHELF_COMPANY_ID`, `INVOICESHELF_CURRENCY_ID` (the actual USD ID on your instance), `INVOICESHELF_TEMPLATE_NAME` (an installed invoice template), and `INVOICESHELF_ESTIMATE_TEMPLATE_NAME` (an installed estimate template). Invoice and estimate template names are separate. Both the company and customer must use that USD currency with two decimal places. Currency is checked before creation; payloads use integer cents and linked customer IDs.

Create the InvoiceShelf customer from **Clients**, then the estimate from **Bids** or invoice from **Invoices**. These controls create records; they do not email invoices. InvoiceShelf status is stored separately and cannot mark the local invoice paid without a ledger payment. Stripe payments are not automatically copied to InvoiceShelf's payment ledger in this release.

Once an export is pending or linked, its financial snapshot cannot be edited or deleted locally. Client edits and changes to estimate terms are also blocked to preserve their exported records. Reusing an unchanged estimate, recording manual invoice payments and changing local ledger-safe statuses remain available. A record changed by another staff request before the export reservation is rejected before contacting InvoiceShelf; refresh and review it before retrying.

A failed/uncertain external creation leaves a durable reservation. Do not clear it and retry blindly. An operator must inspect the remote instance: if the record exists, reconcile its remote ID locally; only if its absence is established should the reservation be cleared. This avoids duplicate financial documents when the remote operation succeeded but its response was lost. Real compatibility still needs a test against your installed InvoiceShelf version.

## Local database and deployment

The additive `007_billing_ledger.sql` migration was applied locally after a PostgreSQL and Command Center backup. Existing clients, invoices, payments and project counts were unchanged. Backup directory: `backups/private-builder-2026-09-21T18-19-46-638Z/` (excluded from Git).

On another existing database, back it up and apply **only** `007_billing_ledger.sql` in a transaction. Do not rerun the legacy migration runner: older migrations can duplicate initial designs. The server requires PostgreSQL and persistent Command Center file storage.

The Pages workflow now builds `public-dist` from an explicit homeowner asset list. It excludes server code, configuration, backups and the old static builder's seeded data. Set the repository variable `BUILDER_APP_URL` to the private app's HTTPS origin when hosted. Until then, the public builder entry explains that its sign-in address has not been published. The original browser-local builder remains in the working copy for recovery; it is not the authenticated server app.

## Reference contracts

- [Clerk Express SDK](https://clerk.com/docs/reference/express/overview)
- [Stripe webhook signature verification](https://docs.stripe.com/webhooks/signature)
- [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests)
- [InvoiceShelf stable invoice validation](https://github.com/InvoiceShelf/InvoiceShelf/blob/2.x/app/Http/Requests/InvoicesRequest.php)
- [InvoiceShelf minor-unit totals](https://github.com/InvoiceShelf/InvoiceShelf/blob/2.x/app/Support/DocumentTotals.php)
