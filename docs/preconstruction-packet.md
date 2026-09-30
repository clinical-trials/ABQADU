# Preconstruction packet draft workflow

This workflow prepares a reusable Albuquerque ADU packet for owner and professional review. It does not establish legal compliance, execute a contract, issue a payable invoice, or authorize construction. Keep **Draft · unsigned · no payment due** visible on the preview and PDF. Business and legal review remain necessary before client use.

## Try the supplied letter-agreement demo

Open `/preconstruction?demo=1` in the builder app, or choose **Try precon agreement demo** from the earlier Estimates page. A saved customer job is not required. The demo uses a sample owner and property; the supplied letter's business name is an editable example, not a verified license identity. The source owner's personal details and original PDF are not included in the repository or public bundle.

The existing form lets you edit the $10,000 proposed fee, scope, parties and terms. **Open demo PDF** renders the current form without saving a project or agreement revision, creating an activity entry, issuing an invoice, or contacting a payment provider. The generated packet carries **Demo · unsigned · no payment due** on its document headings and a permanent demo footer. It has no invented save time, revision or signature. Edits invalidate the prior PDF; blocked popups retain an explicit download/open fallback. Demo edits remain in this tab/session during internal navigation and clear on sign-out or reload.

The preset adapts the supplied letter into the existing editable fields: one-ADU planning and coordination, the owner's option to choose another contractor, replacement by a later executed construction contract, the whole preconstruction fee payable when the final signed **preconstruction** agreement is executed, seven days' written termination, delivery of work product, subcontract assignment, and the source site-inspection/waiver, lien and indemnity provisions. Sensitive provisions are labeled for review. Loading them does not record a completed inspection or execute a waiver. Missing expense limits, refund/accounting details, and the source's undefined “total sum” remain identified. The ordinary termination clause does not determine statutory cancellation requirements.

Tax treatment, fee credit, construction price, license information and notice applicability stay unconfirmed. The payment timing refers to the fee field, so changing the amount does not leave an old $10,000 amount inside the clause. The draft invoice continues to show the whole fee; no installment or construction draw schedule is generated.

For an untouched new real-job draft, **Use letter-agreement template** copies the proposed business terms while preserving that job's parties, property, description and construction estimate. It does not save automatically. Saved or already edited drafts cannot be overwritten by the preset. Existing immutable save and PDF revision behavior remains unchanged.

Private GET `/api/preconstruction/template` returns the reusable preset; GET `/api/preconstruction/demo` returns sample form defaults. POST `/api/preconstruction/demo/packet.pdf` accepts only `{terms}` using the existing term validation, returns a PDF with `X-Preconstruction-Demo: true`, and does not read or write the workspace store. All routes retain the builder session/origin gates and private/no-store responses. PDF text is escaped and rendering does not execute scripts or load external resources.

September 30 demo verification: 700 backend tests across 51 suites passed with PostgreSQL integrations enabled, and all 366 React tests across 26 suites passed. The 57 public checks passed after updating the old demo-card copy assertion. The production client built successfully. Focused demo/template/PDF tests passed again after the final print-layout changes. The five-page sample was rendered and reviewed; PDFium and extracted page coordinates were used to resolve inconsistent Poppler continuation-page rendering. The browser opened a demo PDF directly, withdrew its links after an amount edit, restored defaults on reset, and showed no overflow at 375/390/414/768/1024/1440px or console errors. No customer job or billing record was created. Independent backend/source and frontend reviews found no remaining actionable issue.

## Three separate documents

| Document | Purpose | Financial effect |
| --- | --- | --- |
| Preconstruction agreement draft | Define proposed services, deliverables, exclusions, schedule, fees, changes and termination terms. | The initial **$10,000 is a proposed, editable service fee**, not an approved charge or automatically nonrefundable deposit. |
| Preliminary construction estimate | Show the estimated future build cost, assumptions, allowances and exclusions. | Nonbinding planning information; construction requires a separate signed agreement. Do not automatically credit the preconstruction fee against it. |
| Preconstruction invoice draft | Preview the entire proposed preconstruction fee and reviewed tax treatment. Payment milestone wording remains separate; this version does not calculate or issue milestone invoices. | No billing-ledger entry, payment request, due balance, recorded receipt or payment-provider action is created. |

An unknown tax rate or treatment must appear as **unconfirmed**, not zero or exempt. Do not present a final amount due until the treatment is reviewed. Do not silently add the preconstruction fee to a construction estimate or subtract it as a credit.

## Review, save and print

1. Select the saved job and verify its owner, property and proposed scope. Existing job values are starting inputs, not evidence that terms have been accepted.
2. Edit the packet fields and review all three documents together. Keep missing business details and required attachments visible; do not substitute a placeholder license, signature, approval or paid status.
3. Save a new version. A saved version is an immutable snapshot: later job changes or edits produce another version rather than rewriting prior documents. Saving is not signing, sending or approving the agreement.
4. If another editor has saved first, preserve the local draft, retrieve the latest version and compare the changes before explicitly retrying. Never resolve a version conflict by silently overwriting the other version. An uncertain network retry must reuse the same request identity and unchanged submitted content; a new submission gets a new identity.
5. Print or download the specifically selected saved version. Reserve the PDF tab during the button click, then obtain the PDF through the authenticated request. A blocked popup should leave an explicit Open/Download option. Do not fall back to the newest version or another job if the requested version is missing.

PDF requests and links must remain tied to the selected job, saved version and staff session. Abort pending requests and close/revoke temporary PDF resources when that context changes or the editor closes. A downloaded copy is a separate file and cannot be recalled by signing out. Never put bearer tokens in URLs or public document links.

Open `/preconstruction` from the workspace menu, or use **Preconstruction agreement** on the selected Command Center job. The page autofills saved job details without saving anything until **Save draft** is selected. **Open draft PDF** becomes available after a verified save; edits withdraw the old PDF until another save. Earlier revisions remain available in Saved revisions. Unsaved edits survive workspace navigation in the current tab and staff session, but are not retained after reload/sign-out. Save or copy them first.

The private API lives at `/api/preconstruction`. Agreement GET/PUT uses `/projects/:projectId`; PDF GET uses `/projects/:projectId/versions/:version/packet.pdf`. Each PUT includes a UUID `request_id`, `expected_version` (null for the first save), and allowlisted flat `terms`. Immutable revisions and truthful save/PDF-generation events publish together in the protected `preconstruction_agreements` history in the Command Center store. Generic state updates and workspace resets cannot replace that history. A PDF render is not a record of customer delivery, signature or payment. This file-based store supports one application writer process; preserve it with the deployment's persistent storage and backups.

## Information needed before client use

- Verified contracting entity and any permitted trade name; business address and contacts; active license number and classification appropriate to the services; authorized signer.
- Owner names and authority, property identification, intended use, plan/model and area, jurisdiction, access and existing site information.
- Exact deliverables, number of revisions, inclusions/exclusions, third-party responsibilities and approvals, milestones and estimated timing.
- Confirmed fee, payment milestones, expense authorization limits, tax treatment/rate/date/location, any expressly agreed future credit, and termination/accounting/refund terms.
- How and where the sale was solicited and agreed, whether the use is primarily household or business, presentation language and proposed signing date; applicable cancellation notices and deadline.
- The applicable CID-approved residential disclosure and any other necessary attachments; reviewed professional-design scope, document-use rights and final contract terms.

Use written changes describing the added or removed scope, fee and timing before additional work begins. Avoid a blanket nonrefundable fee, automatic rights waiver, or guarantee of zoning, utility or permit approval. Cancellation rights take precedence over ordinary termination charges where applicable; any remaining charges and refund must follow the agreed itemized terms and applicable law.

## Official sources and review limits

Research checked September 30, 2026. These sources guide a draft; their presence does not certify this packet or decide how a particular transaction is classified.

- **Licensed entity and scope:** [14.6.3.8 NMAC](https://www.srca.nm.gov/parts/title14/14.006.0003.html) ties contracting authority to the entity/name and classifications on the license. Confirm the proposed preconstruction activities and responsible professionals are appropriately authorized.
- **Written bids and residential disclosure:** RLD's [2021 CILA compilation, §60-13-19](https://www.rld.nm.gov/wp-content/uploads/2021/07/Article-13-CILA-7.1.21.pdf) requires a license number on written bids and describes a division-approved disclosure before residential contracting work, signing or payment concerning the limits of license/bond protection against contractor default. Confirm the current statute, applicability and approved form. The current approved form was not located; generated prose is not a CID-approved substitute. [RLD's current laws index](https://www.rld.nm.gov/construction-industries/rules-laws-and-building-codes/) links to NM OneSource, whose current statutory text was inaccessible during this research.
- **New Mexico cancellation:** The official [enacted 2019 text, §57-12-21](https://www.nmlegis.gov/Sessions/19%20Regular/final/HB0100.PDF), with its [enactment record](https://www.nmlegis.gov/Legislation/Legislation?chamber=H&legType=B&legNo=100&year=19), addresses qualifying door-to-door sales and includes seller-initiated telephone sales. Confirm the current statute and transaction-specific requirements before execution. Do not infer a universal three-day cancellation period or treat it as 72 hours.
- **Federal cancellation:** [16 CFR Part 429](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-429) and the [FTC explanation](https://consumer.ftc.gov/articles/buyers-remorse-ftcs-cooling-rule-may-help) cover certain household sales away from the seller's business and identify exceptions. Covered sales require prescribed notices, forms and other procedures. Federal telephone/online exclusions do not determine separate New Mexico coverage. Electronic signing alone does not settle applicability. This draft does not supply completed statutory cancellation forms.
- **Gross receipts tax:** NM Taxation and Revenue describes [taxable service receipts](https://www.tax.newmexico.gov/businesses/gross-receipts-overview/who-must-file/) and [GRT charged to businesses and potentially passed through to customers](https://www.tax.newmexico.gov/governments/2020/10/23/gross-receipts-tax/). Confirm current sourcing, rates and any deduction with the business's tax adviser; do not copy an old rate from a general overview page.
- **Albuquerque approvals:** The City's [casita plan and approval process](https://www.cabq.gov/planning/accessory-dwelling-unit/free-casita-construction-plans) still calls for site-specific submissions, building/trade permits, fees and inspections. A selected or publicly available plan does not establish approval for the owner's property.

The proposed scope, milestone fees, change process and refund wording are business terms for review, not a claim that New Mexico mandates this exact contract form. No universal preconstruction fee cap or definitive enforceability determination was established by this research.
