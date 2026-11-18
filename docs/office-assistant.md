# Contractor Office Assistant

Updated November 18, 2026.

The Command Center now includes saved follow-ups for inquiries, site visits, estimates, customer updates, and check arrangements. Each has an editable template, Albuquerque review date, open/paused/completed status, and timestamped status history. Phone links prepare texts; they do not send or confirm delivery. Follow-ups persist on the server, survive resets, and are protected from generic workspace updates. The API validates inputs and deduplicates retries.

This is a template-assisted foundation, not a connected AI agent. It does not autonomously contact customers, monitor replies, book calendar slots, or calculate outstanding invoice balances. Completing a task does not mark an invoice paid. Contractors must check receipts and disputes before payment follow-up.

## Remaining development

1. Link tasks to authoritative invoices and receipts; suppress reminders for paid, void, disputed, or unverified balances.
2. Add a communication ledger with delivery IDs, incoming replies, retry protection, contact preferences, and stop handling.
3. Add appointment proposals, calendar availability, customer confirmation, and conflict-safe booking.
4. Add AI drafting and conversation summaries grounded in authorized job records; hand off pricing, complaints, and commitments to the contractor.
5. Add a durable background queue with bounded reminder cadence and cancellation when replies, bookings, or payments resolve tasks.
6. Add an all-jobs attention inbox and measures for response time, booking, estimate conversion, overdue balances, and time saved.

Reference: https://www.drillbit.com/ (workflow inspiration; no vendor integration).

Validation: 39 focused client tests and 25 backend tests pass; production client build succeeds. Provider delivery and live booking are not implemented or tested.
