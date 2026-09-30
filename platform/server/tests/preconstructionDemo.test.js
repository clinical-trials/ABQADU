const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { createAuthFixture } = require('./helpers/authFixture');

jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));
jest.mock('../src/services/preconstructionPacketPdf', () => ({ createPreconstructionPacketPdf: jest.fn(async () => Buffer.from('%PDF-demo-fixture')) }));
const auth = createAuthFixture();
const base = '/api/preconstruction';
let directory, previousPath, app, agreement, renderer;
const staff = (method, endpoint, body) => {
  const action = request(app)[method](`${base}${endpoint}`).set('Authorization', `Bearer ${auth.token()}`);
  return body === undefined ? action : action.send(body);
};
const createDemoService = options => require('../src/services/preconstructionDemo').createPreconstructionDemoService(options);
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-preconstruction-demo-'));
  previousPath = process.env.COMMAND_CENTER_STORE_PATH;
  process.env.COMMAND_CENTER_STORE_PATH = path.join(directory, 'state.json');
  jest.resetModules();
  agreement = require('../src/services/preconstructionAgreement');
  renderer = require('../src/services/preconstructionPacketPdf').createPreconstructionPacketPdf;
  app = require('../src/index').createApp({ env: auth.env });
});
afterEach(() => {
  if (previousPath === undefined) delete process.env.COMMAND_CENTER_STORE_PATH;
  else process.env.COMMAND_CENTER_STORE_PATH = previousPath;
  fs.rmSync(directory, { recursive: true, force: true });
});

test('template and demo endpoints remain behind authentication and origin checks', async () => {
  for (const [method, endpoint] of [['get', '/template'], ['get', '/demo'], ['post', '/demo/packet.pdf']]) {
    const anonymous = request(app)[method](`${base}${endpoint}`);
    expect((await (method === 'post' ? anonymous.send({ terms: agreement.defaultTerms() }) : anonymous)).status).toBe(401);
    const foreign = request(app)[method](`${base}${endpoint}`).set('Authorization', `Bearer ${auth.token()}`).set('Origin', 'https://foreign.example.test');
    expect((await (method === 'post' ? foreign.send({ terms: agreement.defaultTerms() }) : foreign)).status).toBe(403);
    const unauthorized = request(app)[method](`${base}${endpoint}`).set('Authorization', `Bearer ${auth.token({ sub: 'user_other' })}`);
    expect((await (method === 'post' ? unauthorized.send({ terms: agreement.defaultTerms() }) : unauthorized)).status).toBe(403);
  }
  expect(fs.readdirSync(directory)).toEqual([]);
});

test('private template and fictional demo loads work without initializing a workspace', async () => {
  const template = await staff('get', '/template');
  expect(template.status).toBe(200);
  expect(template.body).toMatchObject({ template_id: 'letter-agreement-v1', label: 'Preconstruction letter agreement', terms: { owner_name: '', owner_email: '', owner_phone: '', property_address: '' } });
  const demo = await staff('get', '/demo');
  expect(demo.status).toBe(200);
  expect(demo.body).toMatchObject({ project: { id: 'precon-demo', client: 'Demo homeowner', address: 'Demo property — Albuquerque, NM' }, agreement: null, history: [], demo: true });
  expect(Object.keys(demo.body.defaults).sort()).toEqual(Object.keys(agreement.defaultTerms()).sort());
  expect(demo.body.defaults.owner_name).toBe('Demo homeowner');
  expect(demo.body.defaults.property_address).toBe('Demo property — Albuquerque, NM');
  expect(template.headers['cache-control']).toContain('no-store');
  expect(demo.headers['cache-control']).toContain('no-store');
  expect(fs.readdirSync(directory)).toEqual([]);
  expect(renderer).not.toHaveBeenCalled();
});

test('demo PDF uses only reviewed request terms and never reads or changes a broken workspace', async () => {
  const bytes = 'Deliberately invalid fixture JSON: no saved job is required for the demo.';
  fs.writeFileSync(process.env.COMMAND_CENTER_STORE_PATH, bytes);
  const terms = { ...agreement.defaultTerms(), owner_name: 'Fictional demo owner', fee: '1250', tax_treatment: 'additional', tax_amount: '12.34' };
  const response = await staff('post', '/demo/packet.pdf', { terms });
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/^application\/pdf/);
  expect(response.headers['content-disposition']).toBe('inline; filename="abq-adu-preconstruction-demo.pdf"');
  expect(response.headers['x-preconstruction-demo']).toBe('true');
  expect(response.headers['x-agreement-version']).toBeUndefined();
  expect(response.headers['cache-control']).toContain('no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(response.body.toString()).toBe('%PDF-demo-fixture');
  expect(renderer).toHaveBeenCalledTimes(1);
  const record = renderer.mock.calls[0][0];
  expect(Object.keys(record).sort()).toEqual(['demo', 'terms', 'totals', 'review_items'].sort());
  expect(record).toMatchObject({ demo: true, terms: { fee: '1250.00', owner_name: 'Fictional demo owner' }, totals: { currency: 'USD', fee_cents: 125000, tax_cents: 1234, invoice_total_cents: 126234, construction_estimate_cents: null } });
  expect(record.review_items.join(' ')).toMatch(/legal review/i);
  expect(fs.readFileSync(process.env.COMMAND_CENTER_STORE_PATH, 'utf8')).toBe(bytes);
  expect(fs.readdirSync(directory)).toEqual(['state.json']);
  expect(require('../src/db').pool.query).not.toHaveBeenCalled();
});

test('demo rendering refuses extra body fields and invalid agreement terms before renderer side effects', async () => {
  const terms = agreement.defaultTerms();
  for (const body of [{}, [], { terms: null }, { terms, request_id: 'not-a-save' }, { terms, project_id: 'real-job' }, { terms, demo: true },
    ...[{ fee: 10000 }, { fee: '0' }, { fee: '100000000.01' }, { fee: '100000000', tax_treatment: 'additional', tax_amount: '0.01' },
      { tax_treatment: 'paid' }, { scope: 'x'.repeat(6001) }, { scope: 'invalid\u0000text' }, { status: 'signed' }].map(patch => ({ terms: { ...terms, ...patch } }))]) {
    const response = await staff('post', '/demo/packet.pdf', body);
    expect(response.status).toBe(400);
  }
  expect(renderer).not.toHaveBeenCalled();
  expect(fs.readdirSync(directory)).toEqual([]);
});

test('a renderer failure and non-PDF result return sanitized errors without creating records', async () => {
  for (const outcome of [() => { throw new Error('private renderer detail and file path'); }, () => Buffer.from('<html>not a PDF</html>')]) {
    renderer.mockImplementationOnce(outcome);
    const response = await staff('post', '/demo/packet.pdf', { terms: agreement.defaultTerms() });
    expect(response.status).toBe(503);
    expect(response.body.error).toMatch(/demo.*PDF.*unavailable/i);
    expect(JSON.stringify(response.body)).not.toMatch(/private renderer|file path|not a PDF/);
  }
  expect(fs.readdirSync(directory)).toEqual([]);
});

test('a stalled demo renderer has a deadline and a late result cannot become a saved artifact', async () => {
  let resolve;
  const service = createDemoService({ renderPdf: () => new Promise(done => { resolve = done; }), renderTimeoutMs: 10 });
  await expect(service.generatePacket({ terms: agreement.defaultTerms() })).rejects.toMatchObject({ status: 503 });
  resolve(Buffer.from('%PDF-late-fixture'));
  await new Promise(done => setImmediate(done));
  expect(fs.readdirSync(directory)).toEqual([]);
});

test('an aborted demo request stops waiting and pre-aborted work never launches the renderer', async () => {
  const controller = new AbortController();
  let resolve;
  const renderPdf = jest.fn(() => new Promise(done => { resolve = done; }));
  const service = createDemoService({ renderPdf });
  const result = service.generatePacket({ terms: agreement.defaultTerms() }, { signal: controller.signal });
  await new Promise(done => setImmediate(done));
  controller.abort();
  await expect(result).rejects.toMatchObject({ status: 499 });
  resolve(Buffer.from('%PDF-aborted-fixture'));
  await expect(service.generatePacket({ terms: agreement.defaultTerms() }, { signal: controller.signal })).rejects.toMatchObject({ status: 499 });
  expect(renderPdf).toHaveBeenCalledTimes(1);
  expect(fs.readdirSync(directory)).toEqual([]);
});
