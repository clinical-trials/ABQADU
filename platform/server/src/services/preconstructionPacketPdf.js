const { createPdfFromHtml } = require('./clientPacketPdf');

const html = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const text = value => typeof value === 'string' && value.trim() ? value.trim() : 'To be confirmed';
const usd = value => Number.isSafeInteger(value) && value >= 0
  ? (value / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'To be confirmed';
const field = (label, value) => `<div class="field"><dt>${html(label)}</dt><dd>${html(text(value))}</dd></div>`;
const note = (label, value) => `<div class="note-block"><h3>${html(label)}</h3><p class="saved-text">${html(text(value))}</p></div>`;

function renderPreconstructionPacketHtml(record = {}) {
  const terms = record.terms || {};
  const totals = record.totals?.currency === 'USD' ? record.totals : {};
  const saved = typeof record.saved_at === 'string' && Number.isFinite(Date.parse(record.saved_at))
    ? new Date(record.saved_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver', timeZoneName: 'short' }) : 'To be confirmed';
  const revision = Number.isSafeInteger(record.revision) && record.revision > 0 ? String(record.revision) : 'To be confirmed';
  const credit = ({
    unconfirmed: 'Fee credit has not been selected. Confirm whether the preconstruction fee is separate from, or credited toward, a future construction agreement.',
    separate: 'The proposed preconstruction fee is separate from any future construction price, subject to the final signed terms.',
    credited: 'Proposed construction credit: the preconstruction fee is intended to be credited under a separate signed construction agreement. Confirm the amount and application in that agreement.',
  })[terms.fee_credit] || 'Fee credit has not been selected. Confirm the treatment in the final reviewed agreement.';
  const tax = ({
    unconfirmed: 'Tax treatment is not confirmed. Do not treat the fee or draft invoice as an issued amount due.',
    included: `Included in the fee. ${Number.isSafeInteger(totals.tax_cents) && totals.tax_cents >= 0 ? `Included tax component: ${usd(totals.tax_cents)}; not added again.` : 'Included tax component is not confirmed; amount not itemized.'}`,
    additional: `Additional tax is proposed: ${usd(totals.tax_cents)}. Confirm the applicable treatment and amount before issuance.`,
  })[terms.tax_treatment] || 'Tax treatment is not confirmed. Final review is required.';
  const noticeDecision = ({
    unconfirmed: 'Applicability has not been determined.', required: 'The saved review marks notices as required; the actual forms remain to be completed.',
    not_applicable: 'The saved review marks notices as not applicable; confirm the factual and legal basis before execution.',
  })[terms.notice_review] || 'Applicability has not been determined.';
  const reviewItems = Array.isArray(record.review_items) ? record.review_items.filter(item => typeof item === 'string' && item.trim()) : [];
  const sectionHeader = (number, title, subtitle) => `<header class="section-header"><div class="brand-row"><span class="brand">ABQ ADU</span><span class="section-number">REVIEW PACKET / ${number}</span></div><p class="draft-status">DRAFT · UNSIGNED · NO PAYMENT DUE</p><h1>${title}</h1><p class="subtitle">${subtitle}</p><div class="document-meta"><span>Draft ${html(text(record.id))} / revision ${html(revision)}</span><span>Saved ${html(saved)}</span></div></header>`;
  const property = `<div class="property"><span class="label">Property</span><strong>${html(text(terms.property_address))}</strong></div>`;

  // Deliberately read a fixed set of client-facing fields. Other record keys are never serialized.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'">
  <title>ABQ ADU - Draft preconstruction review packet</title>
  <style>
    @page { size: Letter; margin: .48in .58in .66in; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #283e32; font: 9.2pt/1.34 Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; overflow-wrap: anywhere; }
    h1,h2,h3,p { margin: 0; } h1,h2,h3 { break-after: avoid; }
    p, li { orphans: 3; widows: 3; }
    .packet-section + .packet-section { break-before: page; }
    .brand-row { display: flex; justify-content: space-between; gap: 16px; align-items: center; border-top: 4px solid #a87b3e; padding-top: 9px; }
    .brand { font-size: 19pt; font-weight: 800; letter-spacing: -.7px; }
    .section-number { font-size: 7.4pt; letter-spacing: 1px; font-weight: bold; color: #6c7568; }
    .draft-status { font-size: 8pt; font-weight: bold; letter-spacing: .5px; color: #85592e; margin: 10px 0 7px; }
    h1 { font: 25pt/1.08 Georgia, 'Times New Roman', serif; letter-spacing: -.45px; }
    .subtitle { font-size: 9pt; color: #536451; margin: 8px 0; max-width: 620px; }
    .document-meta { display: flex; justify-content: space-between; gap: 18px; padding: 8px 0 10px; border-bottom: 1px solid #d1d8c8; font-size: 7.3pt; color: #626d5e; }
    .document-meta span { max-width: 52%; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 13px; }
    .panel { border: 1px solid #d4ddce; padding: 11px 12px; background: #f5f6ee; }
    h2 { font-size: 12pt; line-height: 1.2; margin-bottom: 7px; }
    h3 { font-size: 9.2pt; margin-bottom: 3px; }
    dl { margin: 0; } .field + .field { margin-top: 5px; }
    dt,.label { display: block; font-size: 7pt; text-transform: uppercase; letter-spacing: .5px; font-weight: bold; color: #66725e; }
    dd { margin: 1px 0 0; white-space: pre-wrap; }
    .property { margin: 12px 0 10px; border-left: 3px solid #a87b3e; padding: 6px 10px; background: #fcf7eb; }
    .property strong { display: block; margin-top: 2px; font-size: 10pt; }
    .note-block { margin-top: 9px; } .saved-text { white-space: pre-wrap; }
    .amount-row { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; margin: 12px 0 8px; padding: 10px 12px; background: #eaf0e4; border: 1px solid #cfdbc6; break-inside: avoid; }
    .amount-row strong { font: 21pt/1.1 Georgia, 'Times New Roman', serif; }
    .amount-row span { max-width: 65%; }
    .terms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 15px; }
    .conditions { margin-top: 12px; padding-top: 10px; border-top: 1px solid #d1d8c8; }
    .conditions p { margin-top: 5px; font-size: 8.3pt; }
    .signatures { margin-top: 13px; break-inside: avoid; }
    .signatures h3 { font-size: 8.5pt; } .signatures p { font-size: 7.8pt; color: #64715f; margin-top: 3px; }
    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 18px; }
    .signature-line { border-top: 1px solid #7b8477; padding-top: 4px; font-size: 7.7pt; color: #5c6857; }
    .signature-line span { float: right; }
    .callout { margin: 13px 0; padding: 10px 12px; border-left: 3px solid #a87b3e; background: #fcf5e6; }
    .callout h2 { font-size: 11pt; } .callout p + p { margin-top: 6px; }
    .review-list { padding-left: 17px; margin: 6px 0 0; } .review-list li { margin: 4px 0; }
    .reference { margin-top: 10px; font-size: 7.5pt; color: #66715f; } a { color: #455d45; text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; table-layout: fixed; }
    th,td { padding: 10px 9px; text-align: left; border-bottom: 1px solid #d1d8c8; vertical-align: top; }
    thead { display: table-header-group; background: #edf2e7; } th { font-size: 8pt; text-transform: uppercase; letter-spacing: .4px; }
    th:last-child,td:last-child { width: 145px; text-align: right; } .invoice-total td { font-size: 13pt; font-weight: bold; border-bottom: 2px solid #526a49; }
    .invoice-description { display: block; font-size: 8pt; color: #63705d; margin-top: 4px; }
    .invoice-status { margin-top: 15px; padding: 14px; background: #283e32; color: #fffdf6; break-inside: avoid; }
    .invoice-status strong { display: block; font-size: 14pt; margin-bottom: 5px; } .invoice-status p { font-size: 9pt; }
  </style></head><body>
  <section class="packet-section" id="agreement">
    ${sectionHeader('01', 'Preconstruction agreement', 'Proposed planning services and terms for review. This is not an execution copy or authorization to start work.')}
    <div class="parties"><div class="panel"><h2>Proposed contractor</h2><dl>${field('Legal entity', terms.contractor_name)}${field('Address', terms.contractor_address)}${field('Contact', [terms.contractor_phone, terms.contractor_email].filter(value => typeof value === 'string' && value.trim()).join(' / '))}${field('License number', terms.license_number)}${field('License classification', terms.license_classification)}</dl></div>
    <div class="panel"><h2>Proposed owner</h2><dl>${field('Owner name', terms.owner_name)}${field('Email', terms.owner_email)}${field('Phone', terms.owner_phone)}</dl><p class="reference">Confirm the parties, ownership and the contractor's exact licensed entity before preparing the final agreement.</p></div></div>
    ${property}${note('Project description', terms.project_description)}${note('Proposed preconstruction scope', terms.scope)}${note('Preconstruction scope exclusions', terms.exclusions)}${note('Third-party costs and responsibilities', terms.third_party_costs)}
    <div class="amount-row"><span><b>Proposed preconstruction fee</b><br>Entire planning-services fee; tax treatment remains subject to the terms below.</span><strong>${html(usd(totals.fee_cents))}</strong></div>
    <div class="terms-grid">${note('Proposed schedule', terms.schedule)}${note('Proposed payment terms', terms.payment_terms)}</div>
    ${note('Fee treatment', credit)}${note('Tax treatment', tax)}${note('Proposed termination terms', terms.termination_terms)}
    <div class="conditions"><h2>Terms to retain in the final review</h2><p>Changes to scope, price or schedule must be approved in writing by both parties before the changed services proceed.</p><p>Approvals are not guaranteed. Zoning, permits, utilities, engineering and agency decisions remain subject to the responsible reviewers.</p><p>Construction work requires a separate signed construction agreement. This planning draft does not authorize construction, establish a final construction price or waive applicable rights.</p><p>Before an invoice can be issued, confirm the parties, finalize scope and tax treatment, complete applicable notices and forms, and review the final agreement and payment terms. No payment authorization is requested by this packet.</p></div>
    <div class="signatures"><h3>Reserved for the final reviewed agreement</h3><p>Blank reference lines only. Do not sign this draft; no electronic signature is requested or captured.</p><div class="signature-grid"><div class="signature-line">Contractor signature <span>Date</span></div><div class="signature-line">Owner signature <span>Date</span></div></div></div>
  </section>
  <section class="packet-section" id="construction-estimate">
    ${sectionHeader('02', 'Preliminary construction estimate', 'A planning reference for a future construction agreement. It is not the preconstruction fee or a request for payment.')}
    ${property}
    <div class="amount-row"><span><b>Preliminary construction amount</b><br>Subject to scope, site conditions, approvals and a separate signed construction agreement.</span><strong>${html(usd(totals.construction_estimate_cents))}</strong></div>
    ${note('Estimate assumptions', terms.estimate_assumptions)}
    <div class="note-block"><h3>Construction scope and exclusions still require review</h3><p>The saved exclusions and third-party costs on the agreement pages describe preconstruction services. Construction inclusions, exclusions and third-party cost responsibilities must be reviewed separately; they are not inferred from those planning-services exclusions.</p></div>
    <div class="callout"><h2>Review gaps before a final agreement</h2>${reviewItems.length ? `<ul class="review-list">${reviewItems.map(item => `<li>${html(item)}</li>`).join('')}</ul>` : '<p>No field gaps were listed in this saved review. That does not establish approval, legal compliance or readiness to sign.</p>'}</div>
    <div class="conditions"><h2>Required notice and form review</h2><p>${html(noticeDecision)}</p><p>CID-approved residential disclosure: applicability and current form require confirmation before signing or payment.</p><p>Applicable cancellation notices and duplicate forms must be completed before client execution; this draft does not supply them or waive rights.</p>${note('Saved notice-review details', terms.notice_details)}<p>Confirm solicitation, location and method of agreement before deciding which notices apply. No universal cancellation period is asserted by this packet.</p></div>
    <p class="reference">Review references: <a href="https://www.rld.nm.gov/wp-content/uploads/2021/07/Article-13-CILA-7.1.21.pdf">NM Construction Industries Licensing Act, Section 60-13-19</a>; <a href="https://www.nmlegis.gov/Sessions/19%20Regular/final/HB0100.PDF">NM cancellation provisions, Section 57-12-21</a>; <a href="https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-429">16 CFR Part 429</a>. Confirm current applicability and actual approved forms during final review.</p>
  </section>
  <section class="packet-section" id="draft-invoice">
    ${sectionHeader('03', 'Preconstruction draft invoice', 'Preview of the proposed planning-services charge only. This draft has not been issued and no payment is due.')}
    <div class="parties"><div class="panel"><h2>Proposed issuer</h2><dl>${field('Contractor', terms.contractor_name)}${field('Address', terms.contractor_address)}${field('Contact', [terms.contractor_phone, terms.contractor_email].filter(value => typeof value === 'string' && value.trim()).join(' / '))}${field('License number', terms.license_number)}</dl></div><div class="panel"><h2>Proposed bill to</h2><dl>${field('Owner', terms.owner_name)}${field('Email', terms.owner_email)}${field('Issue / due date', 'Not issued / no payment due')}</dl></div></div>
    ${property}
    <table aria-label="Draft preconstruction charge"><thead><tr><th>Proposed charge</th><th>Amount (USD)</th></tr></thead><tbody><tr><td><strong>Entire preconstruction fee</strong><span class="invoice-description">Planning services described in the proposed agreement. Construction work and its preliminary estimate are not billed here.</span></td><td>${html(usd(totals.fee_cents))}</td></tr>
    <tr><td><strong>Tax review</strong><span class="invoice-description">${html(tax)}</span></td><td>${terms.tax_treatment === 'included' ? 'Included in the fee' : terms.tax_treatment === 'additional' ? html(usd(totals.tax_cents)) : 'To be confirmed'}</td></tr>
    <tr class="invoice-total"><td>Proposed invoice total</td><td>${html(usd(['included', 'additional'].includes(terms.tax_treatment) ? totals.invoice_total_cents : null))}</td></tr></tbody></table>
    <div class="invoice-status"><strong>No payment due</strong><p>This is an unsigned draft for review, not an issued invoice, payment authorization or statement of an outstanding balance.</p></div>
    ${note('Proposed payment timing', terms.payment_terms)}${note('Fee credit / separation', credit)}
    <p class="reference">Review the agreement conditions and notice checklist before preparing an issued invoice. The preliminary construction estimate is not billed here.</p>
  </section></body></html>`;
}

async function createPreconstructionPacketPdf(record) {
  return createPdfFromHtml(renderPreconstructionPacketHtml(record), {
    displayHeaderFooter: true,
    headerTemplate: '<div style="width:100%;margin:0 42px;font-family:Arial,sans-serif;font-size:7px;color:#697363;">ABQ ADU / PRECONSTRUCTION REVIEW PACKET / DRAFT ONLY</div>',
    footerTemplate: '<div style="width:100%;margin:0 42px;border-top:1px solid #d1d8c8;padding-top:7px;font-family:Arial,sans-serif;font-size:8px;color:#59664f;display:flex;justify-content:space-between;"><span>ABQ ADU / DRAFT / UNSIGNED / NO PAYMENT DUE</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
  });
}

module.exports = { renderPreconstructionPacketHtml, createPreconstructionPacketPdf };
