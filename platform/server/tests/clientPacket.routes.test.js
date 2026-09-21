const request = require('supertest');
const { createAuthFixture } = require('./helpers/authFixture');

jest.mock('../src/db', () => ({ pool: { query: jest.fn(async () => ({ rows: [] })) } }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));
jest.mock('../src/services/commandCenterStore', () => ({ loadCommandCenter: jest.fn(), saveCommandCenter: jest.fn(), resetCommandCenter: jest.fn() }));
jest.mock('puppeteer', () => ({ launch: jest.fn() }));

const fixture = createAuthFixture();
const app = require('../src/index').createApp({ env: fixture.env });
const store = require('../src/services/commandCenterStore');
const puppeteer = require('puppeteer');
const endpoint = '/api/command-center/projects/packet-fixture/client-packet.pdf';
let html;
let browser;
let page;

beforeEach(() => {
  jest.clearAllMocks();
  html = '';
  store.loadCommandCenter.mockResolvedValue({ projects: [{
    id: 'packet-fixture', client: 'Rivera & family', address: '123 Fixture Street',
    model: 'Altura 650', sqft: 650, bid_total: 185000,
    cogs_high: 123456, cogs_low: 112233, internal_notes: 'PRIVATE BUILDER MEMO',
    metrics: { gross_profit_floor: 'PRIVATE MARGIN' },
  }] });
  page = {
    setJavaScriptEnabled: jest.fn(async () => {}),
    setRequestInterception: jest.fn(async () => {}),
    on: jest.fn(),
    setContent: jest.fn(async value => { html = value; }),
    pdf: jest.fn(async () => Buffer.from('%PDF-1.7\nfixture-pdf-bytes')),
  };
  browser = { newPage: jest.fn(async () => page), close: jest.fn(async () => {}), process: jest.fn(() => ({ kill: jest.fn() })) };
  puppeteer.launch.mockResolvedValue(browser);
});

const authorized = () => request(app).get(endpoint).set('Authorization', `Bearer ${fixture.token()}`);

test('opens an inline, private PDF from the saved project with the complete client payment schedule', async () => {
  const response = await authorized();
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/application\/pdf/);
  expect(response.headers['content-disposition']).toBe('inline; filename="abq-adu-packet-fixture-packet.pdf"');
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
  expect(html).toContain('ABQ ADU');
  expect(html).toContain('Estimate &amp; payment schedule');
  expect(html).toContain('Rivera &amp; family');
  expect(html).toContain('123 Fixture Street');
  expect(html).toContain('Altura 650');
  expect(html).toContain('650 sq ft');
  expect(html).toContain('$185,000');
  for (const amount of ['$10,000', '$92,500', '$46,250', '$36,250']) expect(html).toContain(amount);
  expect(html).toContain('Final payment tied to punch list');
  expect(html).toContain('not a request for payment');
  expect(html).not.toMatch(/123456|112233|PRIVATE BUILDER MEMO|PRIVATE MARGIN/);
  expect(browser.close).toHaveBeenCalledTimes(1);
  expect(store.saveCommandCenter).not.toHaveBeenCalled();
});

test('treats project strings as text and prevents renderer network access and scripts', async () => {
  store.loadCommandCenter.mockResolvedValue({ projects: [{
    id: 'packet-fixture', client: '<script>fetch("https://evil.test")</script>',
    address: '<img src="http://127.0.0.1/private" onerror="alert(1)">',
    model: '<style>@import "https://evil.test"</style>', sqft: 650, bid_total: 185000,
  }] });
  const response = await authorized();
  expect(response.status).toBe(200);
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('&lt;img');
  expect(html).not.toMatch(/<script\b|<img\b|<iframe\b/);
  expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
  expect(page.setRequestInterception).toHaveBeenCalledWith(true);
  const onRequest = page.on.mock.calls.find(([event]) => event === 'request')[1];
  const resource = { abort: jest.fn(async () => {}) };
  onRequest(resource);
  expect(resource.abort).toHaveBeenCalled();
});

test('unknown projects return 404 before launching the PDF engine', async () => {
  store.loadCommandCenter.mockResolvedValue({ projects: [] });
  const response = await authorized();
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ error: 'Project not found' });
  expect(puppeteer.launch).not.toHaveBeenCalled();
});

test('renderer failures return a safe actionable error and close the browser', async () => {
  page.pdf.mockRejectedValue(new Error('private /Users/secret/path token=do-not-display'));
  const response = await authorized();
  expect(response.status).toBe(503);
  expect(response.body.error).toMatch(/PDF.*unavailable/);
  expect(JSON.stringify(response.body)).not.toMatch(/secret|token=|do-not-display/);
  expect(browser.close).toHaveBeenCalledTimes(1);
});

test('missing Chromium returns a controlled PDF error without leaking its installation path', async () => {
  puppeteer.launch.mockRejectedValue(new Error('Chrome missing at /Users/secret/path'));
  const response = await authorized();
  expect(response.status).toBe(503);
  expect(response.body.error).toMatch(/PDF.*unavailable/);
  expect(JSON.stringify(response.body)).not.toContain('/Users/secret');
});

test('uses installed stable Chrome when the bundled Chromium cannot run', async () => {
  puppeteer.launch.mockRejectedValueOnce(new Error('spawn Unknown system error -88'));
  const response = await authorized();
  expect(response.status).toBe(200);
  expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
  expect(puppeteer.launch.mock.calls[1][0]).toMatchObject({ channel: 'chrome' });
  expect(browser.close).toHaveBeenCalledTimes(1);
});

test('PDF export requires an allowlisted signed session; browser cookies alone cannot authorize it', async () => {
  expect((await request(app).get(endpoint)).status).toBe(401);
  expect((await request(app).get(endpoint).set('Cookie', `__session=${fixture.token()}`)).status).toBe(401);
  expect((await request(app).get(endpoint).set('Authorization', `Bearer ${fixture.token({ sub: 'user_outsider' })}`)).status).toBe(403);
  expect(puppeteer.launch).not.toHaveBeenCalled();
  expect(store.loadCommandCenter).not.toHaveBeenCalled();
});
