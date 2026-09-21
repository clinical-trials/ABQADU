# Private Builder and Billing Implementation Plan

> **For agentic workers:** Use test-first implementation with independent bounded work and a final integrated review. Track completed steps below.

**Goal:** Protect the private builder workspace and connect saved invoices to verified payment records.
**Architecture:** Clerk verified sessions + explicit staff allowlist; PostgreSQL invoice/payment ledger + signed Stripe webhook; React authenticated transport.
**Tech Stack:** Existing Express/PostgreSQL/React, official Clerk SDKs and Stripe SDK.
**Spec:** ../specs/2026-09-21-private-builder-billing.md

## Global constraints

Preserve existing JSON and PostgreSQL records. No auth bypass. No secret-bearing client configuration. No external sends/live payments/publication. Runtime configuration requires actual provider credentials before acceptance testing. Keep the active authorized checkout and checkpoint locally.

## Review focus

- A forged token or newly registered non-staff account never reads business APIs.
- Missing credentials lock the app without leaking project details.
- A retries/concurrent request cannot duplicate an imported invoice or successful payment.
- Changing projects/session cannot leave another project's payment link or stale private data visible.
- Provider success followed by local failure can be recovered using the same attempt identity.

## 1. Server access boundary

Owner: server auth agent. Files: server auth module, index.js, auth tests, relevant existing app-boundary tests, server package/lock and env example. Install both server Clerk and Stripe dependencies once to avoid concurrent lockfile writes.

- [x] Add failing HTTP tests for private routes without a token, malformed token, missing config, disallowed user and valid allowed session.
- [x] Implement `GET /api/auth/config` returning `{configured,publishableKey}` and protected `GET /api/auth/session` returning `{userId}`; protect every other business API before routers. Export a testable auth middleware; no runtime test bypass.
- [x] Reserve `POST /api/billing/stripe/webhook` with raw JSON body before JSON parsing/auth. Billing router mounted at `/api/billing` behind auth. Coordinate exact exports with billing implementer.
- [x] Verify signed test JWTs through the actual SDK where possible, test origin/authorized-party denial, and adapt existing app-boundary tests with explicit test fixtures.

## 2. Billing service and persistence

Owner: billing agent. Files: new billing migration/service/router/webhook and tests; invoice guards, disable arbitrary checkout endpoint. Interface: `POST /api/billing/command-center/:projectId/import` => `{invoices:[...]}`, `POST /api/billing/invoices/:id/checkout` => `{id,url,invoice_id}`, signed webhook under reserved path. Existing `/api/invoices` provides ledger list/balance.

- [x] Add failing import/checkout/webhook tests using provider stubs only at network boundary, with temporary real PostgreSQL schema for transactional invariants where possible.
- [x] Implement unique source mapping, transaction-safe import and payment recording, checkout association/idempotency, signature validation, and invoice/manual-payment guards.
- [x] Test repeated imports, arbitrary-amount rejection, currency/amount/session mismatch, forged or expired signatures, duplicate events, duplicate sessions, unpaid checkout, concurrent/retry behavior and rollback.
- [x] Supply isolated additive migration commands; never run the legacy migration runner.

## 3. Browser auth and transport

Owner: client auth agent. Files: App/index, new auth components/API transport, existing request helper and remaining direct fetch sites except CommandCenter, client package/lock and tests. Interface: `apiFetch(url, options)` in utils/authFetch.js; token provider registered by auth boundary, only same-origin `/api/` gets Bearer auth. Root will change CommandCenter fetch import.

- [x] Test signed-out/setup/access-denied screens and that protected children never mount until authorized.
- [x] Implement ClerkProvider, sign-in/sign-out UI, server session authorization gate, token transport and session-loss unmounting. No public sign-up granting access.
- [x] Test off-origin request refusal/no credential forwarding, unavailable auth config and session changes; preserve request helpers' errors/PDF behavior.

## 4. Invoice UI, integration copy and final verification

Owner: root. Files: Invoices.jsx, Clients.jsx, CommandCenter.jsx, IntegrationSetup, tests and setup/recovery docs.

- [x] Write failing UI tests for source-draft import then navigation to invoices, creating invoice-specific payment links, provider failures and explicit InvoiceShelf customer/invoice sync.
- [x] Wire new actions with pending/error states and usable invoice links; retire arbitrary deposit checkout. Keep balances based on recorded payments.
- [x] Apply only the additive billing migration after backup; run server/client/static suites and production build. Browser-check locked auth and payment-return screens; verify private workflows through test fixtures without live provider calls.
- [x] Independent final review, fix issues, document actual credential/setup requirements and limits, then local checkpoint.

## Account acceptance still required

The user will configure existing Clerk and Stripe accounts privately. Real approved/unapproved sign-in, Stripe test checkout and webhook delivery, and InvoiceShelf instance compatibility remain unverified until that configuration is available. No public deployment or live provider operation was performed.

## Final verification — September 21, 2026

- Server: 251 tests across 23 suites pass, including real PostgreSQL tests in disposable schemas (`BILLING_TEST_DATABASE_URL=postgresql://localhost/abqadu npm test`). No skipped tests.
- Client: 113 tests across 15 suites pass (`CI=true npm exec -- react-scripts test --watchAll=false --runInBand`). Production build succeeds.
- Public/static checks: all 30 pass (`node --test tests/*.test.js`). `git diff --check` is clean.
- Browser: locked setup and public payment-return screens render at 390 px; viewport restored. Anonymous business APIs deny access while configuration is missing; health and return page respond normally.
- Final review fixes include InvoiceShelf snapshot/version reservations, protected exported terms, transactional bid edits and retry-safe bid-to-invoice draw schedules. Existing records were preserved after the additive migration and backup.
