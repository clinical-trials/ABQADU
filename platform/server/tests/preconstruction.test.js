const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { createAuthFixture } = require('./helpers/authFixture');

jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));
jest.mock('../src/services/preconstructionPacketPdf', () => ({ createPreconstructionPacketPdf: jest.fn(async () => Buffer.from('%PDF-fixture')) }));
const auth = createAuthFixture();
const url = '/api/preconstruction/projects/job-fixture';
let directory, previousPath, store, service, renderer, app;
const authorized = (method, endpoint = url, input) => {
  const req = request(app)[method](endpoint).set('Authorization', `Bearer ${auth.token()}`);
  return input === undefined ? req : req.send(input);
};
const job = { id: 'job-fixture', client: 'Fixture owner', address: 'Fixture property', model: 'Fixture model', bid_total: 185000, cogs_low: 123456, internal_notes: 'PRIVATE MARGIN MEMO' };
const input = (overrides = {}) => ({ request_id: randomUUID(), expected_version: null, terms: service.defaultTerms(job), ...overrides });

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-preconstruction-'));
  previousPath = process.env.COMMAND_CENTER_STORE_PATH;
  process.env.COMMAND_CENTER_STORE_PATH = path.join(directory, 'state.json');
  fs.writeFileSync(process.env.COMMAND_CENTER_STORE_PATH, JSON.stringify({ projects: [job, { id: 'other-job', client: 'Other fixture' }] }));
  jest.resetModules();
  store = require('../src/services/commandCenterStore');
  service = require('../src/services/preconstructionAgreement');
  renderer = require('../src/services/preconstructionPacketPdf').createPreconstructionPacketPdf;
  app = require('../src/index').createApp({ env: { ...auth.env, CLERK_ALLOWED_USER_IDS: 'user_allowed,user_other' } });
});
afterEach(() => {
  if (previousPath === undefined) delete process.env.COMMAND_CENTER_STORE_PATH;
  else process.env.COMMAND_CENTER_STORE_PATH = previousPath;
  fs.rmSync(directory, { recursive: true, force: true });
});

test('private list and detail GETs return limited project fields and proposed defaults without saving', async () => {
  const before = fs.readFileSync(store.storePath, 'utf8');
  expect((await request(app).get('/api/preconstruction')).status).toBe(401);
  const list = await authorized('get', '/api/preconstruction');
  expect(list.status).toBe(200);
  expect(list.body.projects[0]).toEqual({ id: job.id, client: job.client, address: job.address, model: job.model });
  expect(JSON.stringify(list.body)).not.toMatch(/cogs|PRIVATE/);
  const detail = await authorized('get');
  expect(detail.body).toMatchObject({ project: { id: job.id, client: job.client, address: job.address }, agreement: null, history: [], defaults: { fee: '10000.00', construction_estimate: '185000.00', contractor_name: '', license_number: '', fee_credit: 'unconfirmed', tax_treatment: 'unconfirmed' } });
  expect(detail.headers['cache-control']).toContain('no-store');
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
  expect(require('../src/db').pool.query).not.toHaveBeenCalled();
});

test.each([
  [undefined, ''], ['', ''], ['   ', ''], ['$180k–$210k; owner allowances discussed separately', '$180k–$210k; owner allowances discussed separately'],
  [123456, ''], [null, ''], ['x'.repeat(201), ''], ['line one\nline two', ''],
])('client target budget %j is intake metadata only and GET does not save records', async (budget, expected) => {
  const project = { ...job, ...(budget === undefined ? {} : { client_target_budget: budget }) };
  fs.writeFileSync(store.storePath, JSON.stringify({ projects: [project] }));
  const before = fs.readFileSync(store.storePath, 'utf8');
  const detail = await authorized('get');
  expect(detail.status).toBe(200);
  expect(detail.body.project.client_target_budget).toBe(expected);
  expect(detail.body.project).not.toHaveProperty('internal_notes');
  expect(detail.body.defaults).toMatchObject({ fee: '10000.00', construction_estimate: '185000.00' });
  expect(detail.body.defaults).not.toHaveProperty('client_target_budget');
  expect(detail.body.agreement).toBeNull();
  expect(service.describeAgreement(detail.body.defaults).totals).toEqual({
    fee_cents: 1000000, construction_estimate_cents: 18500000, tax_cents: null, invoice_total_cents: null, currency: 'USD',
  });
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
  expect(JSON.stringify(detail.body)).not.toMatch(/PRIVATE MARGIN MEMO|internal_notes/);
});

test('later budget edits affect intake metadata without changing saved agreement terms or totals', async () => {
  const first = (await authorized('put', url, input())).body.agreement;
  await store.saveCommandCenter(current => ({ projects: current.projects.map(project => project.id === job.id
    ? { ...project, client_target_budget: 'Discuss a target near $190k' } : project) }));
  const before = fs.readFileSync(store.storePath, 'utf8');
  const snapshot = JSON.parse(before).preconstruction_agreements;
  const detail = await authorized('get');
  expect(detail.status).toBe(200);
  expect(detail.body.project.client_target_budget).toBe('Discuss a target near $190k');
  expect(detail.body.agreement).toEqual(first);
  expect(detail.body.defaults).toMatchObject({ fee: '10000.00', construction_estimate: '185000.00' });
  expect(JSON.stringify(snapshot)).not.toMatch(/client_target_budget|target near/);
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
  expect(() => service.normalizeTerms({ ...first.terms, client_target_budget: 'Not an agreement term' })).toThrow(/unsupported/);
});

test('a missing workspace stays missing on GET and PUT without initializing starter customers', async () => {
  fs.unlinkSync(store.storePath);
  expect((await authorized('get', '/api/preconstruction')).status).toBe(503);
  expect((await authorized('get')).status).toBe(503);
  expect((await authorized('put', url, input())).status).toBe(503);
  expect(fs.existsSync(store.storePath)).toBe(false);
});

test('normalization validates bounded fields, decimals and enums while keeping unresolved totals unknown', () => {
  const terms = service.defaultTerms(job);
  expect(service.normalizeTerms({ ...terms, fee: '10000' }).fee).toBe('10000.00');
  expect(service.describeAgreement(terms).totals).toEqual({ fee_cents: 1000000, construction_estimate_cents: 18500000, tax_cents: null, invoice_total_cents: null, currency: 'USD' });
  expect(service.describeAgreement({ ...terms, tax_treatment: 'included' }).totals).toMatchObject({ tax_cents: null, invoice_total_cents: 1000000 });
  expect(service.describeAgreement({ ...terms, tax_treatment: 'additional', tax_amount: '123.45' }).totals).toMatchObject({ tax_cents: 12345, invoice_total_cents: 1012345 });
  expect(service.describeAgreement({ ...terms, tax_treatment: 'additional', tax_amount: '' }).totals.invoice_total_cents).toBeNull();
  expect(service.describeAgreement({ ...terms, tax_treatment: 'unconfirmed', tax_amount: '500.00' }).totals).toMatchObject({ tax_cents: null, invoice_total_cents: null });
  expect(service.normalizeTerms({ ...terms, tax_treatment: 'unconfirmed', tax_amount: '500' }).tax_amount).toBe('500.00');
  expect(service.describeAgreement({ ...terms, construction_estimate: '' }).totals.construction_estimate_cents).toBeNull();
  const review = service.describeAgreement(terms).review_items.join(' ');
  expect(review).toMatch(/contractor|entity/i);
  expect(review).toMatch(/license/i);
  expect(review).toMatch(/tax/i);
  expect(review).toMatch(/credit/i);
  expect(review).toMatch(/notice/i);
  expect(review).toMatch(/legal review/i);
  expect(review).toMatch(/attach/i);
  for (const patch of [ { fee: -1 }, { fee: '-1' }, { fee: '0' }, { fee: '1.001' }, { fee: '1e3' }, { fee: '100000000.01' }, { fee: '100000000', tax_treatment: 'additional', tax_amount: '0.01' }, { construction_estimate: false }, { tax_amount: 500 }, { fee_credit: 'paid' }, { tax_treatment: 'exempt' }, { notice_review: 'signed' }, { scope: 'bad\u0000text' }, { owner_name: 'x'.repeat(201) }, { status: 'signed' }, { tax_treatment: 'included', tax_amount: '10000.01' } ]) {
    expect(() => service.normalizeTerms({ ...terms, ...patch })).toThrow();
  }
});

test('saving stamps the verified actor and persists protected revision data plus one truthful audit event', async () => {
  const payload = { ...input(), saved_by: 'forged', status: 'signed' };
  const saved = await authorized('put', url, payload);
  expect(saved.status).toBe(200);
  expect(saved.body).toMatchObject({ replayed: false, agreement: { project_id: job.id, revision: 1, terms: { owner_name: 'Fixture owner' }, totals: { invoice_total_cents: null } } });
  expect(saved.body.agreement.version).toMatch(/^[a-f\d-]{36}$/);
  const state = await store.loadCommandCenter();
  expect(state.preconstruction_agreements).toHaveLength(1);
  expect(state.preconstruction_agreements[0]).toMatchObject({ saved_by: 'user_allowed', request_id: payload.request_id });
  expect(state.activity_events).toHaveLength(1);
  expect(state.activity_events[0]).toMatchObject({ project_id: job.id, actor_id: 'user_allowed', type: 'preconstruction.draft_saved' });
  expect(state.activity_events[0].summary).not.toMatch(/signed|sent|paid|issued/i);
  expect(require('../src/db').pool.query).not.toHaveBeenCalled();
});

test('concurrent revision changes enforce expected version and exact uncertain retries return the current revision', async () => {
  const original = input();
  const replies = await Promise.all([authorized('put', url, original), authorized('put', url, original)]);
  expect(replies.map(reply => reply.status)).toEqual([200, 200]);
  expect(replies.map(reply => reply.body.replayed).sort()).toEqual([false, true]);
  const version = replies[0].body.agreement.version;
  const edits = await Promise.all([
    authorized('put', url, input({ expected_version: version, terms: { ...original.terms, scope: 'First change' } })),
    authorized('put', url, input({ expected_version: version, terms: { ...original.terms, scope: 'Second change' } })),
  ]);
  expect(edits.map(reply => reply.status).sort()).toEqual([200, 409]);
  const current = (await authorized('get')).body.agreement;
  expect(current.revision).toBe(2);
  const before = fs.readFileSync(store.storePath, 'utf8');
  const replay = await authorized('put', url, { ...original, request_id: original.request_id.toUpperCase() });
  expect(replay.body).toEqual({ agreement: current, replayed: true });
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
  expect((await authorized('put', url, { ...original, terms: { ...original.terms, fee: '1' } })).status).toBe(409);
  expect((await request(app).put(url).set('Authorization', `Bearer ${auth.token({ sub: 'user_other' })}`).send(original)).status).toBe(409);
  expect((await store.loadCommandCenter()).activity_events).toHaveLength(2);
});

test('generic updates, stale full-state saves and reset cannot erase or forge saved agreement revisions', async () => {
  const first = await authorized('put', url, input());
  expect(first.status).toBe(200);
  const before = (await store.loadCommandCenter()).preconstruction_agreements;
  expect((await authorized('put', '/api/command-center', { preconstruction_agreements: [] })).status).toBe(400);
  await store.saveCommandCenter({ preconstruction_agreements: [{ version: 'forged' }] });
  expect((await store.loadCommandCenter()).preconstruction_agreements).toEqual(before);
  await store.resetCommandCenter();
  expect((await store.loadCommandCenter()).preconstruction_agreements).toEqual(before);
});

test('printing an exact saved version preserves quoted terms after later agreement and job edits', async () => {
  const original = input();
  const first = (await authorized('put', url, original)).body.agreement;
  await authorized('put', url, input({ expected_version: first.version, terms: { ...original.terms, fee: '12000', owner_name: 'Updated owner' } }));
  await store.saveCommandCenter(current => ({ projects: current.projects.map(project => project.id === job.id ? { ...project, bid_total: 999999, client: 'Later job owner' } : project) }));
  const printed = await authorized('get', `${url}/versions/${first.version}/packet.pdf`);
  expect(printed.status).toBe(200);
  expect(printed.body.subarray(0, 5).toString()).toBe('%PDF-');
  expect(printed.headers['cache-control']).toContain('no-store');
  expect(printed.headers['x-agreement-version']).toBe(first.version);
  expect(renderer).toHaveBeenCalledWith(first);
  expect((await store.loadCommandCenter()).activity_events.at(-1)).toMatchObject({ type: 'preconstruction.pdf_generated', project_id: job.id, actor_id: 'user_allowed' });
  expect(require('../src/db').pool.query).not.toHaveBeenCalled();
});

test('invalid projects, request/version/terms, foreign origins and failed PDF generation leave no false success', async () => {
  const before = fs.readFileSync(store.storePath, 'utf8');
  expect((await authorized('put', '/api/preconstruction/projects/missing', input())).status).toBe(404);
  for (const payload of [{}, input({ request_id: 'invalid' }), input({ expected_version: 'invalid' }), input({ terms: [] })]) {
    expect((await authorized('put', url, payload)).status).toBe(400);
  }
  expect((await request(app).put(url).set('Authorization', `Bearer ${auth.token()}`).set('Origin', 'https://foreign.example').send(input())).status).toBe(403);
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
  const first = (await authorized('put', url, input())).body.agreement;
  renderer.mockRejectedValueOnce(new Error('secret renderer path'));
  const failed = await authorized('get', `${url}/versions/${first.version}/packet.pdf`);
  expect(failed.status).toBe(503);
  expect(JSON.stringify(failed.body)).not.toContain('secret');
  expect((await store.loadCommandCenter()).activity_events).toHaveLength(1);
  expect((await authorized('get', `${url}/versions/${randomUUID()}/packet.pdf`)).status).toBe(404);
});

test('failed atomic save preserves both revisions and audit and permits the same request retry', async () => {
  const before = fs.readFileSync(store.storePath, 'utf8');
  const payload = input();
  const rename = jest.spyOn(require('node:fs/promises'), 'rename').mockRejectedValueOnce(new Error('Disk fixture failure'));
  try {
    expect((await authorized('put', url, payload)).status).toBe(503);
    expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
    expect((await authorized('put', url, payload)).status).toBe(200);
    expect((await store.loadCommandCenter()).preconstruction_agreements).toHaveLength(1);
  } finally { rename.mockRestore(); }
});

test('retries remain idempotent after a service restart and cannot reuse another project’s request or packet', async () => {
  const payload = input();
  const first = (await authorized('put', url, payload)).body.agreement;
  const before = fs.readFileSync(store.storePath, 'utf8');
  jest.resetModules();
  store = require('../src/services/commandCenterStore');
  service = require('../src/services/preconstructionAgreement');
  renderer = require('../src/services/preconstructionPacketPdf').createPreconstructionPacketPdf;
  app = require('../src/index').createApp({ env: auth.env });
  expect((await authorized('put', url, payload)).body).toEqual({ agreement: first, replayed: true });
  expect((await authorized('put', '/api/preconstruction/projects/other-job', payload)).status).toBe(409);
  expect((await authorized('get', `/api/preconstruction/projects/other-job/versions/${first.version}/packet.pdf`)).status).toBe(404);
  expect((await request(app).get(`${url}/versions/${first.version}/packet.pdf`)).status).toBe(401);
  expect((await request(app).put(url).send(payload)).status).toBe(401);
  expect(renderer).not.toHaveBeenCalled();
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
});

test('bounded read and PDF deadlines cannot publish a success event when a late renderer finishes', async () => {
  const unavailable = service.createPreconstructionAgreementService({ readState: () => new Promise(() => {}), readTimeoutMs: 10 });
  await expect(unavailable.listProjects()).rejects.toMatchObject({ status: 503, message: 'Saved workspace data is temporarily unavailable.' });
  const first = (await authorized('put', url, input())).body.agreement;
  const before = fs.readFileSync(store.storePath, 'utf8');
  let finish;
  const saveState = jest.fn();
  const delayed = service.createPreconstructionAgreementService({
    readState: async () => JSON.parse(fs.readFileSync(store.storePath, 'utf8')),
    renderPdf: () => new Promise(resolve => { finish = resolve; }),
    saveState, renderTimeoutMs: 10,
  });
  await expect(delayed.generatePacket(job.id, first.version, 'user_allowed')).rejects.toMatchObject({ status: 503 });
  finish(Buffer.from('%PDF-late-fixture'));
  await new Promise(resolve => setImmediate(resolve));
  expect(saveState).not.toHaveBeenCalled();
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
});

test('a failed print audit publication returns an error and preserves the saved history', async () => {
  const first = (await authorized('put', url, input())).body.agreement;
  const before = fs.readFileSync(store.storePath, 'utf8');
  const rename = jest.spyOn(require('node:fs/promises'), 'rename').mockRejectedValueOnce(new Error('Private disk failure'));
  try {
    const response = await authorized('get', `${url}/versions/${first.version}/packet.pdf`);
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toMatch(/Private disk/);
    expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
    expect((await authorized('get', `${url}/versions/${first.version}/packet.pdf`)).status).toBe(200);
    expect((await store.loadCommandCenter()).activity_events.filter(event => event.type === 'preconstruction.pdf_generated')).toHaveLength(1);
  } finally { rename.mockRestore(); }
});
