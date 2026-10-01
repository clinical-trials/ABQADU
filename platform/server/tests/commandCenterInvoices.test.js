const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const request = require('supertest');

let directory, previousPath, storePath, app;
const job = { id: 'invoice-example', client: 'Example homeowner', address: 'Example site', bid_total: 185000 };
const endpoint = `/api/command-center/projects/${job.id}`;
const read = () => JSON.parse(fs.readFileSync(storePath, 'utf8'));
const write = project => fs.writeFileSync(storePath, JSON.stringify({ projects: [project], activity_events: [] }));
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-four-invoices-'));
  previousPath = process.env.COMMAND_CENTER_STORE_PATH;
  storePath = path.join(directory, 'workspace.json');
  process.env.COMMAND_CENTER_STORE_PATH = storePath;
  write(job);
  jest.resetModules();
  app = express(); app.use(express.json());
  app.use('/api/command-center', require('../src/routes/commandCenter'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
});
afterEach(() => {
  if (previousPath === undefined) delete process.env.COMMAND_CENTER_STORE_PATH;
  else process.env.COMMAND_CENTER_STORE_PATH = previousPath;
  fs.rmSync(directory, { recursive: true, force: true });
});

test('prepares exactly four invoices with the deposit credited before the 50/25/25 split', async () => {
  const response = await request(app).post(`${endpoint}/invoice-drafts`);
  expect(response.status).toBe(201);
  const project = response.body.projects[0];
  expect(project.invoice_drafts.map(draw => draw.amount)).toEqual([10000, 87500, 43750, 43750]);
  expect(project.draw_schedule.map(draw => draw.amount)).toEqual([10000, 87500, 43750, 43750]);
  expect(project.invoice_drafts.slice(1).map(draw => draw.label).join(' ')).toMatch(/50%.*25%.*25%/);
  expect(project.invoice_drafts.slice(1).every(draw => /remaining balance/i.test(draw.label))).toBe(true);
  expect(new Set(project.invoice_drafts.map(draw => draw.id)).size).toBe(4);
  const preview = await request(app).get(`${endpoint}/client-view-preview`);
  expect(preview.body.invoice_drafts).toEqual(project.invoice_drafts);
});

test('concurrent and repeated preparation preserves one saved set without appending activity', async () => {
  const responses = await Promise.all([request(app).post(`${endpoint}/invoice-drafts`), request(app).post(`${endpoint}/invoice-drafts`)]);
  expect(responses.map(response => response.status).sort()).toEqual([200, 201]);
  const before = fs.readFileSync(storePath, 'utf8');
  const retry = await request(app).post(`${endpoint}/invoice-drafts`);
  expect(retry.status).toBe(200);
  expect(fs.readFileSync(storePath, 'utf8')).toBe(before);
  expect(read().activity_events.filter(event => event.type === 'invoice_drafts.prepared')).toHaveLength(1);
});

test('saved older or custom schedules remain intact in preparation and client preview', async () => {
  const drafts = [
    { id: 'old-1', label: 'Saved deposit', amount: 10000, status: 'Paid', notes: 'Saved public note', paid: 10000, internal_notes: 'PRIVATE_TEST_NOTE' },
    { id: 'old-2', label: 'Saved mobilization', amount: 92500, status: 'Sent' },
    { id: 'old-3', label: 'Saved final', amount: 82500, status: 'Draft' },
  ];
  write({ ...job, invoice_drafts: drafts, draw_schedule: drafts });
  const before = fs.readFileSync(storePath, 'utf8');
  const retry = await request(app).post(`${endpoint}/invoice-drafts`);
  expect(retry.status).toBe(200);
  expect(retry.body.projects[0].invoice_drafts).toEqual(drafts);
  const preview = await request(app).get(`${endpoint}/client-view-preview`);
  expect(preview.body.invoice_drafts.map(draw => draw.amount)).toEqual([10000, 92500, 82500]);
  expect(JSON.stringify(preview.body)).not.toContain('PRIVATE_TEST_NOTE');
  expect(fs.readFileSync(storePath, 'utf8')).toBe(before);
});

test.each([0, 5000, 10000, 10000.03, -1, 'not a price'])('invalid or insufficient price %j cannot create drafts or change the saved file', async total => {
  write({ ...job, bid_total: total });
  const before = fs.readFileSync(storePath, 'utf8');
  const response = await request(app).post(`${endpoint}/invoice-drafts`);
  expect(response.status).toBe(400);
  expect(fs.readFileSync(storePath, 'utf8')).toBe(before);
});

test('malformed saved drafts cannot be replaced by the generator', async () => {
  write({ ...job, invoice_drafts: { note: 'Preserve for recovery' } });
  const before = fs.readFileSync(storePath, 'utf8');
  expect((await request(app).post(`${endpoint}/invoice-drafts`)).status).toBe(409);
  expect(fs.readFileSync(storePath, 'utf8')).toBe(before);
});

test.each([{ note: 'Preserve for recovery' }, [null], [{ amount: 'not money' }], [{ id: { internal_notes: 'PRIVATE_ID_FIXTURE' }, amount: 10000 }]])('malformed saved schedule %j cannot be replaced with proposed terms in preview', async drafts => {
  write({ ...job, invoice_drafts: drafts });
  const before = fs.readFileSync(storePath, 'utf8');
  const response = await request(app).get(`${endpoint}/client-view-preview`);
  expect(response.status).toBe(409);
  expect(response.body.error).toMatch(/saved schedule.*review/i);
  expect(response.body.invoice_drafts).toBeUndefined();
  const pdf = await request(app).get(`${endpoint}/client-packet.pdf`);
  expect(pdf.status).toBe(409);
  expect(pdf.body.error).toMatch(/saved schedule.*review/i);
  expect(fs.readFileSync(storePath, 'utf8')).toBe(before);
});
