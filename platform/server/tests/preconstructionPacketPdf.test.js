jest.mock('puppeteer', () => ({ launch: jest.fn() }));

const puppeteer = require('puppeteer');
const { renderPreconstructionPacketHtml, createPreconstructionPacketPdf } = require('../src/services/preconstructionPacketPdf');
const record = () => ({
  id: 'draft-fixture', project_id: 'synthetic-project', version: '7d36c597-fdcc-4b9c-b998-40ee06f62a85', revision: 2, saved_at: '2026-10-01T15:00:00.000Z',
  terms: {
    contractor_name: 'Fixture Construction LLC', contractor_address: '100 Example Avenue, Albuquerque, NM', contractor_phone: '505-555-0100', contractor_email: 'fixture@example.test',
    license_number: '', license_classification: '', owner_name: 'Sample Homeowner', owner_email: 'owner@example.test', owner_phone: '505-555-0101',
    property_address: '200 Sample Street, Albuquerque, NM', project_description: 'Plan a detached backyard ADU.', fee: '10000.00', construction_estimate: '185000.00',
    fee_credit: 'unconfirmed', tax_treatment: 'unconfirmed', tax_amount: '', scope: 'Site review and preliminary design coordination.', exclusions: 'Construction work and permit fees.',
    schedule: 'Dates to be confirmed after site review.', payment_terms: 'Payment timing to be confirmed in the final agreement.', termination_terms: 'Termination terms remain under review.',
    estimate_assumptions: 'Subject to measured site conditions and approved plans.', third_party_costs: 'Survey, engineering and utility fees require separate confirmation.',
    notice_review: 'unconfirmed', notice_details: '',
  },
  totals: { fee_cents: 1000000, construction_estimate_cents: 18500000, tax_cents: null, invoice_total_cents: null, currency: 'USD' },
  review_items: ['Confirm contractor legal entity and license.', 'Review tax treatment.'],
});
let page, browser;
beforeEach(() => {
  page = { setJavaScriptEnabled: jest.fn(async () => {}), setRequestInterception: jest.fn(async () => {}), on: jest.fn(), setContent: jest.fn(async () => {}), pdf: jest.fn(async () => Buffer.from('%PDF-1.7\nfixture')) };
  browser = { newPage: jest.fn(async () => page), close: jest.fn(async () => {}), process: jest.fn(() => ({ kill: jest.fn() })) };
  puppeteer.launch.mockReset().mockResolvedValue(browser);
});

test('renders separately paged agreement, preliminary construction estimate and full-fee draft invoice', () => {
  const html = renderPreconstructionPacketHtml(record());
  expect(html).toContain('Preconstruction agreement'); expect(html).toContain('Preliminary construction estimate'); expect(html).toContain('Preconstruction draft invoice');
  expect((html.match(/class="packet-section/g) || [])).toHaveLength(3);
  expect(html).toContain('break-before: page'); expect(html).toContain('size: Letter');
  expect((html.match(/DRAFT · UNSIGNED · NO PAYMENT DUE/g) || [])).toHaveLength(3);
  const invoice = html.split('id="draft-invoice"')[1];
  expect(invoice).toContain('$10,000.00'); expect(invoice).not.toContain('$185,000.00');
  expect(invoice).toContain('Entire preconstruction fee'); expect(invoice).toContain('Not issued');
});

test('demo packet is visibly unsaved without fabricated revision or signature metadata', async () => {
  const {terms,totals,review_items}=record();
  const input={demo:true,terms,totals,review_items};
  const html=renderPreconstructionPacketHtml(input);
  expect((html.match(/DEMO · UNSIGNED · NO PAYMENT DUE/g)||[])).toHaveLength(3);
  expect(html).toContain('Sample packet · not saved to a job');
  expect(html).not.toContain('revision To be confirmed');
  expect(html).not.toContain('Saved To be confirmed');
  expect(html).toContain('Editable demonstration');
  await createPreconstructionPacketPdf(input);
  expect(page.pdf.mock.calls[0][0].footerTemplate).toContain('DEMO');
  expect(page.pdf.mock.calls[0][0].headerTemplate).toContain('DEMO');
});

test('keeps unknown license, credit, tax and notice decisions visible without inventing terms or balances', () => {
  const html = renderPreconstructionPacketHtml(record());
  expect(html).toContain('License number'); expect(html).toContain('To be confirmed');
  expect(html).toContain('Fee credit has not been selected'); expect(html).toContain('Tax treatment is not confirmed');
  expect(html).toContain('Confirm contractor legal entity and license.'); expect(html).toContain('Review tax treatment.');
  expect(html).not.toContain('nonrefundable'); expect(html).not.toContain('NM-GC-'); expect(html).not.toContain('$0.00');
  expect(html).toContain('Reserved for the final reviewed agreement'); expect(html).not.toMatch(/<input\b|contenteditable|e-signature/i);
});

test('included tax can remain an unknown component while the total stays the fee', () => {
  const input = record(); input.terms.tax_treatment = 'included'; input.totals.invoice_total_cents = input.totals.fee_cents;
  const invoice = renderPreconstructionPacketHtml(input).split('id="draft-invoice"')[1];
  expect(invoice).toContain('Included in the fee'); expect(invoice).toContain('Included tax component is not confirmed');
  expect(invoice).toContain('$10,000.00'); expect(invoice).not.toContain('$0.00');
});

test('unconfirmed tax never exposes a retained tax amount or total as reviewed', () => {
  const input = record(); input.terms.tax_amount = '800.00'; input.totals.tax_cents = 80000; input.totals.invoice_total_cents = 1080000;
  const html = renderPreconstructionPacketHtml(input);
  expect(html).not.toContain('$800.00'); expect(html).not.toContain('$10,800.00'); expect(html).toContain('Tax treatment is not confirmed');
});

test('saved preconstruction exclusions stay with the agreement, not the construction estimate scope', () => {
  const input = record(); input.terms.exclusions = 'EXCLUDED_PLANNING_SCOPE'; input.terms.third_party_costs = 'PLANNING_THIRD_PARTY_COSTS';
  const html = renderPreconstructionPacketHtml(input);
  const agreement = html.split('id="construction-estimate"')[0];
  const estimate = html.split('id="construction-estimate"')[1].split('id="draft-invoice"')[0];
  expect(agreement).toContain('EXCLUDED_PLANNING_SCOPE'); expect(agreement).toContain('PLANNING_THIRD_PARTY_COSTS');
  expect(estimate).not.toContain('EXCLUDED_PLANNING_SCOPE'); expect(estimate).not.toContain('PLANNING_THIRD_PARTY_COSTS');
  expect(estimate).toContain('Construction inclusions, exclusions and third-party cost responsibilities must be reviewed separately');
});

test('additional tax and an explicit credit use only reviewed saved terms', () => {
  const input = record(); input.terms.tax_treatment = 'additional'; input.terms.tax_amount = '800.00'; input.terms.fee_credit = 'credited';
  input.totals.tax_cents = 80000; input.totals.invoice_total_cents = 1080000;
  const html = renderPreconstructionPacketHtml(input);
  expect(html).toContain('$800.00'); expect(html).toContain('$10,800.00'); expect(html).toContain('Proposed construction credit');
  expect(html).not.toContain('Fee credit has not been selected');
});

test('missing money is shown as unconfirmed rather than silently becoming zero', () => {
  const input = record(); input.terms.fee = ''; input.terms.construction_estimate = ''; input.totals = { currency: 'USD' };
  const html = renderPreconstructionPacketHtml(input);
  expect(html).toContain('To be confirmed'); expect(html).not.toMatch(/\$0\.00|\$10,000\.00|\$185,000\.00/);
});

test('only allowlisted client terms appear and all user text is escaped', () => {
  const input = record();
  input.terms.owner_name = '<img src="https://private.example/a" onerror="alert(1)">';
  input.terms.scope = '<script>evil()</script> & "quoted" scope';
  input.review_items.push('<iframe src="file:///private/data">');
  input.cogs = 'SECRET_COGS'; input.margin = 'SECRET_MARGIN'; input.internal_supplier = 'PRIVATE_SUPPLIER'; input.terms.internal_notes = 'PRIVATE_INTERNAL_NOTES';
  const html = renderPreconstructionPacketHtml(input);
  expect(html).toContain('&lt;img'); expect(html).toContain('&lt;script&gt;'); expect(html).toContain('&lt;iframe');
  expect(html).not.toMatch(/<script\b|<img\b|<iframe\b|SECRET_COGS|SECRET_MARGIN|PRIVATE_SUPPLIER|PRIVATE_INTERNAL_NOTES/);
  expect(html).toContain("default-src 'none'"); expect(html).not.toMatch(/<link\b/);
});

test('long scopes and review lists remain complete and can flow across extra pages', () => {
  const input = record(); input.terms.scope = `${'A detailed site review line.\n'.repeat(200)}FINAL_SCOPE_SENTINEL`;
  input.terms.termination_terms = `${'Review ending the proposed services. '.repeat(90)}FINAL_TERMINATION_SENTINEL`;
  input.review_items = Array.from({ length: 60 }, (_, index) => `Review item ${index + 1}`);
  const html = renderPreconstructionPacketHtml(input);
  expect(html).toContain('FINAL_SCOPE_SENTINEL'); expect(html).toContain('FINAL_TERMINATION_SENTINEL'); expect(html).toContain('Review item 60');
  expect(html).toContain('white-space: pre-wrap'); expect(html).toContain('overflow-wrap: anywhere');
  expect(html).not.toMatch(/height:\s*11in|overflow:\s*hidden/);
});

test('preserves rights and marks official forms as pending rather than supplied or approved', () => {
  const html = renderPreconstructionPacketHtml(record());
  expect(html).toContain('CID-approved residential disclosure: applicability and current form require confirmation before signing or payment.');
  expect(html).toContain('Applicable cancellation notices and duplicate forms must be completed before client execution');
  expect(html).toContain('does not supply them or waive rights');
  expect(html).toContain('separate signed construction agreement'); expect(html).toContain('approved in writing by both parties');
  expect(html).toContain('Approvals are not guaranteed'); expect(html).not.toMatch(/legally enforceable|72 hours|three.day cancellation|form attached/i);
});

test('renders PDF using the shared isolated browser and a page-numbered permanent draft footer', async () => {
  const result = await createPreconstructionPacketPdf(record());
  expect(result.subarray(0, 5).toString()).toBe('%PDF-');
  expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false); expect(page.setRequestInterception).toHaveBeenCalledWith(true);
  const handler = page.on.mock.calls.find(([event]) => event === 'request')[1], resource = { abort: jest.fn(async () => {}) }; handler(resource);
  expect(resource.abort).toHaveBeenCalled(); expect(page.setContent.mock.calls[0][0]).toContain('Preconstruction draft invoice');
  expect(page.pdf).toHaveBeenCalledWith(expect.objectContaining({ format: 'Letter', timeout: 10000, displayHeaderFooter: true, footerTemplate: expect.stringContaining('pageNumber') }));
  expect(page.pdf.mock.calls[0][0].footerTemplate).toContain('NO PAYMENT DUE'); expect(browser.close).toHaveBeenCalledTimes(1);
});

test('PDF failures still close the isolated browser and invalid output is rejected', async () => {
  page.pdf.mockResolvedValue(Buffer.from('<html>not a PDF</html>'));
  await expect(createPreconstructionPacketPdf(record())).rejects.toThrow('Invalid PDF output'); expect(browser.close).toHaveBeenCalledTimes(1);
});
