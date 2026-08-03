# Version 9 Final Demo Design

## Goal

Version 9 turns the ABQ ADU prototype into a final demo draft that can be shown as a real builder workflow, not just a static website. The homeowner site remains public and reviewable. The builder platform gains a server-backed command center that can save demo data for projects, estimates, supplier bidout, receipts, mileage, client views, weather/code notes, and next actions.

## Scope

Version 9 focuses on Option 1 plus the most important parts of Option 2:

- Final demo polish across visible copy: Version 9.
- Mobile-friendly builder navigation and command-center triage.
- Server-backed demo persistence using a JSON store so the demo works without requiring a live Postgres setup.
- A builder command center that helps Ian triage the most important business items first: active bids, supplier quote gaps, invoices/payments, materials bidout, receipts, mileage, client views, weather/code actions, and text-ready messages.
- Keep the existing Postgres-backed routes intact for the production path.

## Non-Goals

- Full Clerk/Supabase auth.
- Live Stripe payments.
- Live SMS delivery through Twilio.
- Live InvoiceShelf deployment.
- Automated plan parsing or OCR from receipts.

Those remain production integrations. Version 9 should clearly show where they plug in without pretending they are already complete.

## Architecture

Version 9 adds a lightweight Express route, `GET/POST /api/command-center`, backed by a local JSON file. This gives the demo durable saves on the server and avoids breaking when Postgres is unavailable. The React builder app adds a `CommandCenter` page that consumes this route and presents a mobile-first cockpit for the builder.

The static GitHub Pages files keep the current public review links and visible Version 9 text. The real demo path is the `platform/` app served by the Express server after the React client is built.

## Builder Command Center Data

The command center store includes:

- Projects: homeowner/client, address, model, square footage, bid total, COGS target, status, confidence, next action.
- Supplier quotes: Lowe's, RAKS, Rio Grande, SIP/PUR panel package, delivery window, status, quoted total.
- Receipts: vendor, amount, project, category, note.
- Mileage: date, project, miles, purpose.
- Activity: client viewed estimate/invoice, payment received, supplier quote update, weather/code note.
- Message drafts: text-ready summaries for Ian/builder follow-up.

## Success Criteria

- The branch is named `Version-9`.
- Visible website/platform copy says Version 9.
- The builder platform has a mobile-friendly Command Center nav item.
- Command Center can load demo data from the server, save edits, and retain them between page refreshes.
- Static tests and backend tests pass.
- Branch is pushed to GitHub for review.
