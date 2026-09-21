# Private builder workspace and invoice payments

The user requested real sign-in and access controls, followed by invoice and payment integration. Preserve the existing public homeowner site, Command Center JSON drafts, and PostgreSQL records. Implement locally; external account setup, real-user sign-in, and provider acceptance testing require the user's accounts.

## Access design

Use Clerk's maintained React and Express SDKs. The first release is a single private workspace for explicitly allowed staff IDs (`CLERK_ALLOWED_USER_IDS`); no self-registration grants workspace access. All business APIs require a verified Clerk session and allowlist membership. Require a Bearer token, with authorized parties restricted by `APP_ORIGINS`; reject browser origins outside this set. No development bypass. Missing or invalid auth configuration locks data behind a setup screen. Only health, minimal public auth configuration, the static login app, and the signed Stripe webhook are public. Clear app data from the UI on sign-out/session loss. Fetch helpers attach tokens only to same-origin API paths. Use runtime publishable-key configuration; never expose secret keys or the staff allowlist to the browser. Current staff share workspace permissions; homeowner/crew roles require a separate design.

## Invoice design

PostgreSQL is the financial ledger. Import an explicitly selected Command Center project's saved invoice drafts by unique source IDs, without regenerating amounts or silently updating issued invoices. Imports are transactional and repeatable without duplicates. Keep JSON source records unchanged and show the imported invoice workflow to the user. Existing SQL invoices remain valid.

Create checkout only for a stored invoice's outstanding USD balance; the browser cannot set the payment amount or invoice metadata. Persist checkout attempts/session association and use stable provider idempotency keys. Block mutation/manual payments that would invalidate an active checkout. Replace the old arbitrary-amount checkout route with a refusal directing callers to invoice checkout.

Verify Stripe webhook signatures over the raw request body with the official SDK. Process successful paid checkout notifications transactionally; verify session association, currency, exact amount, and test/live mode. Deduplicate both provider events and payment/session IDs. Delayed/unpaid checkout and return-page visits do not mark invoices paid. Unknown or failed events cannot corrupt balances. Paid state derives from the ledger. Failed provider/database work returns retryable errors and preserves drafts. Return pages show neutral information and never record payment.

InvoiceShelf remains the optional invoice portal. Expose the existing customer and invoice sync steps, clearly distinguishing provider configuration from provider-tested readiness. Do not claim atomic exactly-once behavior across InvoiceShelf without a supported provider idempotency contract.

## Verification and rollout

Tests cover missing/forged/expired/disallowed tokens, unconfigured setup, session changes, credentials never sent off-origin, repeated imports, payment amount tampering, bad webhook signatures, mismatched payment metadata, duplicate/concurrent notifications and unpaid/failed sessions. Run relevant full suites and a production build; manually inspect locked setup and responsive auth screens. Apply only the new additive migration after a local PostgreSQL backup; never replay the legacy migration runner. Do not publish, send messages, take live payments, or create external accounts in this work.
