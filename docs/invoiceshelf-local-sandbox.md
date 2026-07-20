# InvoiceShelf Local Sandbox

InvoiceShelf is used as the back-office estimate/invoice engine. ABQ ADU does not vendor or modify InvoiceShelf source code.

## Sandbox Target

- Repository: https://github.com/InvoiceShelf/InvoiceShelf/tree/3.x
- Docs: https://docs.invoiceshelf.com/
- API docs: https://api-docs.invoiceshelf.com/
- License: AGPL-3.0

## Local Startup

1. Follow the InvoiceShelf Docker install guide for the selected release.
2. Create one ABQ ADU company.
3. Add the ABQ ADU logo, phone `505-977-7659`, and address `131 Madison NE, Albuquerque, NM 87108`.
4. Create an API token.
5. Put the token and company id into `platform/server/.env`.

## ABQ ADU Environment

```dotenv
INVOICESHELF_BASE_URL=http://localhost:8080
INVOICESHELF_API_TOKEN=replace-with-token
INVOICESHELF_COMPANY_ID=replace-with-company-id
INVOICESHELF_TIMEOUT_MS=12000
```

## Manual Proof

1. Create or select an ABQ ADU client.
2. Create a bid with a customer-facing line item.
3. Sync the client to InvoiceShelf.
4. Sync the bid to an InvoiceShelf estimate.
5. Confirm internal COGS and supplier comparison lines are absent from the InvoiceShelf estimate.
6. Convert the estimate after customer approval.
7. Generate the ABQ ADU draw schedule.
8. Sync Invoice 1 as `$10,000 Preconstruction Contract`.
9. Open the InvoiceShelf client view.
10. Sync status back into ABQ ADU.

## Builder Workflow Notes

ABQ ADU remains the project cockpit for model selection, square footage, COGS, supplier comparisons, SIP/PUR panel comparison, draw scheduling, and homeowner communication. InvoiceShelf should be treated as the document engine for professional estimates, invoice records, payment visibility, hosted client views, and future open/view tracking.
