const express = require('express');
const request = require('supertest');

jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('puppeteer', () => ({ launch: jest.fn() }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));
const { pool } = require('../src/db');
const puppeteer = require('puppeteer');

let app, bid, items, page, browser;
const pdfBytes = Buffer.from('%PDF-1.7\nfixture');

beforeEach(() => {
  bid = {
    id: 12, bid_number: 'BID-2026-0012', title: 'Kitchen installation', status: 'draft',
    client_name: 'Fixture owner', client_address: 'Fixture address',
    client_email: 'owner@example.test', client_phone: '555-0100',
    valid_until: '2026-11-01', notes: 'Reviewed scope',
    markup_pct: '60.00', contingency_pct: '5.00', tax_pct: '7.625',
  };
  items = [
    { id: 1, bid_id: 12, category: 'Materials', description: 'Cabinet', qty: '2.00', unit: 'ea', unit_cost: '125.50', sort_order: 0 },
    { id: 2, bid_id: 12, category: 'Labor', description: 'Installation', qty: '4.00', unit: 'hr', unit_cost: '50.00', sort_order: 1 },
  ];
  pool.query.mockReset().mockImplementation(async sql => {
    if (sql.includes('FROM bids b')) return { rows: bid ? [bid] : [] };
    if (sql.includes('FROM bid_line_items')) return { rows: items };
    throw new Error(`Unexpected PDF query: ${sql}`);
  });
  page = {
    setJavaScriptEnabled: jest.fn(async () => {}),
    setRequestInterception: jest.fn(async () => {}),
    on: jest.fn(), setContent: jest.fn(async () => {}),
    pdf: jest.fn(async () => pdfBytes),
  };
  browser = { newPage: jest.fn(async () => page), close: jest.fn(async () => {}) };
  puppeteer.launch.mockReset().mockResolvedValue(browser);
  app = express();
  app.use('/bids', require('../src/routes/bids'));
});

test('PDF keeps customer, scope and document metadata as literal text rather than active markup', async () => {
  Object.assign(bid, {
    bid_number: '<b>BID & "One"</b>',
    title: '<script>title()</script>',
    client_name: '<img src="https://example.test/name">',
    client_address: '<iframe src="file:///private/address"></iframe>',
    client_email: '<a href="https://example.test">owner & partner</a>',
    client_phone: '<svg onload="phone()"></svg>',
    valid_until: '<em>2026-11-01</em>',
    notes: 'Owner\'s <style>@import "https://example.test/style";</style> notes',
  });
  Object.assign(items[0], {
    category: '<link href="https://example.test/category">',
    description: '<img src="https://example.test/item" onerror="item()">',
    unit: '<video src="https://example.test/unit"></video>',
  });

  const response = await request(app).post('/bids/12/pdf');
  expect(response.status).toBe(200);
  const html = page.setContent.mock.calls[0][0];
  for (const literal of [
    '&lt;b&gt;BID &amp; &quot;One&quot;&lt;/b&gt;',
    '&lt;script&gt;title()&lt;/script&gt;',
    '&lt;img src=&quot;https://example.test/name&quot;&gt;',
    '&lt;iframe src=&quot;file:///private/address&quot;&gt;&lt;/iframe&gt;',
    '&lt;a href=&quot;https://example.test&quot;&gt;owner &amp; partner&lt;/a&gt;',
    '&lt;svg onload=&quot;phone()&quot;&gt;&lt;/svg&gt;',
    '&lt;em&gt;2026-11-01&lt;/em&gt;',
    'Owner&#39;s &lt;style&gt;@import &quot;https://example.test/style&quot;;&lt;/style&gt; notes',
    '&lt;link href=&quot;https://example.test/category&quot;&gt;',
    '&lt;img src=&quot;https://example.test/item&quot; onerror=&quot;item()&quot;&gt;',
    '&lt;video src=&quot;https://example.test/unit&quot;&gt;&lt;/video&gt;',
  ]) expect(html).toContain(literal);
  expect(html).not.toMatch(/<(?:script|img|iframe|svg|link|video)\b/i);
  expect(html).not.toContain('<style>@import');
});

test('PDF keeps reviewed prices, calculated totals and the existing Letter layout', async () => {
  const response = await request(app).post('/bids/12/pdf');
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/^application\/pdf/);
  expect(response.headers['content-disposition']).toContain('BID-2026-0012.pdf');
  expect(response.body).toEqual(pdfBytes);
  const html = page.setContent.mock.calls[0][0];
  for (const value of ['$125.50', '$251.00', '$200.00', '$451.00', '$270.60', '$22.55', '$56.74', '$800.89']) {
    expect(html).toContain(value);
  }
  expect(html).toContain('60.00% markup');
  expect(html).toContain('7.625%');
  expect(page.pdf).toHaveBeenCalledWith({ format: 'Letter', margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  expect(browser.close).toHaveBeenCalledTimes(1);
});

test('PDF disables scripts and blocks resource requests before loading bid content', async () => {
  await request(app).post('/bids/12/pdf').expect(200);
  expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
  expect(page.setRequestInterception).toHaveBeenCalledWith(true);
  expect(page.setJavaScriptEnabled.mock.invocationCallOrder[0]).toBeLessThan(page.setContent.mock.invocationCallOrder[0]);
  expect(page.setRequestInterception.mock.invocationCallOrder[0]).toBeLessThan(page.setContent.mock.invocationCallOrder[0]);
  const handler = page.on.mock.calls.find(([event]) => event === 'request')?.[1];
  expect(handler).toEqual(expect.any(Function));
  for (const url of ['https://example.test/resource', 'http://127.0.0.1/private', 'file:///private/data']) {
    const resource = { url: () => url, abort: jest.fn(async () => {}), continue: jest.fn(async () => {}) };
    await handler(resource);
    expect(resource.abort).toHaveBeenCalledTimes(1);
    expect(resource.continue).not.toHaveBeenCalled();
  }
});

test('PDF renderer failure returns an error and closes the isolated browser', async () => {
  page.pdf.mockRejectedValueOnce(new Error('Fixture renderer failure'));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = await request(app).post('/bids/12/pdf');
    expect(response.status).toBe(503);
    expect(response.body.error).toMatch(/PDF export is unavailable/);
    expect(browser.close).toHaveBeenCalledTimes(1);
  } finally { log.mockRestore(); }
});

test('missing bids never launch a PDF browser', async () => {
  bid = null;
  await request(app).post('/bids/12/pdf').expect(404);
  expect(puppeteer.launch).not.toHaveBeenCalled();
});
