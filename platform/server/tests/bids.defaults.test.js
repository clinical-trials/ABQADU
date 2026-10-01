const express = require('express');
const request = require('supertest');

jest.mock('../src/db', () => ({ pool: { query: jest.fn(), connect: jest.fn() } }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));
const { pool } = require('../src/db');
const { generateBOM } = require('../src/services/bomGenerator');

let app, bids, lineItems;

// Model only the SQL boundary used by these real routes. An omitted INSERT
// percentage deliberately keeps the existing database's 18% default.
async function query(sql, values = []) {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) return { rows: [] };
  if (normalized.startsWith('SELECT COUNT(*)')) return { rows: [{ n: bids.size }] };
  if (normalized.startsWith('SELECT * FROM designs')) return { rows: [{ id: 10, name: 'Example design', rooms: [] }] };
  const insert = normalized.match(/^INSERT INTO (bids|bid_line_items) \(([^)]+)\)/);
  if (insert) {
    const columns = insert[2].split(',').map(column => column.trim());
    const supplied = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    if (insert[1] === 'bids') {
      const row = { id: bids.size + 1, status: 'draft', markup_pct: 18, tax_pct: 7.625, contingency_pct: 5,
        client_id: null, notes: null, valid_until: null, invoiceshelf_estimate_id: null, invoiceshelf_sync_error: null, ...supplied };
      bids.set(row.id, row);
      return { rows: [{ ...row }] };
    }
    const row = { id: lineItems.length + 1, ...supplied };
    lineItems.push(row);
    return { rows: [{ ...row }] };
  }
  if (normalized.startsWith('SELECT * FROM bid_line_items')) return { rows: lineItems.filter(item => item.bid_id === Number(values[0])).map(item => ({ ...item })) };
  if (normalized.startsWith('SELECT b.*') || normalized.startsWith('SELECT * FROM bids')) {
    const row = bids.get(Number(values[0]));
    return { rows: row ? [{ ...row }] : [] };
  }
  if (normalized.startsWith('UPDATE bids SET')) {
    const id = Number(values.at(-1));
    const row = bids.get(id);
    for (const [, column, parameter] of normalized.split(' WHERE ')[0].matchAll(/(\w+)=\$(\d+)/g)) row[column] = values[Number(parameter) - 1];
    return { rows: [] };
  }
  throw new Error(`Unexpected fixture query: ${normalized}`);
}

beforeEach(() => {
  bids = new Map(); lineItems = [];
  pool.query.mockImplementation(query);
  pool.connect.mockResolvedValue({ query, release() {} });
  generateBOM.mockReturnValue({ totalSf: 500, items: [{ label: 'Example construction cost', qty: 1, costPerUnit: 100000 }] });
  app = express();
  app.use(express.json());
  app.use('/bids', require('../src/routes/bids'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: 'Request failed' }));
});

const createInput = { title: 'Example estimate', tax_pct: 0, contingency_pct: 0,
  items: [{ description: 'Example construction cost', qty: 1, unit_cost: 100000 }] };

test('a new direct bid defaults to 60 percent markup on its cost subtotal', async () => {
  const response = await request(app).post('/bids').send(createInput);
  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({ markup_pct: 60, totals: { subtotal: 100000, markup: 60000, total: 160000 } });
});

test('a design-derived bid explicitly stores 60 percent despite an older database default', async () => {
  const response = await request(app).post('/bids/from-design/10').send({});
  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({ design_id: 10, markup_pct: 60,
    totals: { subtotal: 100000, markup: 60000, contingency: 5000, preTax: 165000 } });
  expect(response.body.items).toHaveLength(1);
});

test.each([[0, 100000], [18, 118000], [35.5, 135500], [100, 200000]])('explicit %s percent markup remains the caller’s choice', async (markup, total) => {
  const response = await request(app).post('/bids').send({ ...createInput, markup_pct: markup });
  expect(response.status).toBe(201);
  expect(response.body.markup_pct).toBe(markup);
  expect(response.body.totals.total).toBe(total);
});

test('reading and updating an existing estimate keeps its saved percentage and pricing', async () => {
  const saved = { id: 41, title: 'Saved estimate', status: 'draft', markup_pct: '18.00', tax_pct: '0.000',
    contingency_pct: '0.00', notes: 'Saved terms', client_id: null, valid_until: null };
  bids.set(saved.id, { ...saved });
  lineItems.push({ id: 8, bid_id: 41, description: 'Saved cost', qty: '1.00', unit_cost: '100000.00', unit: 'ea', sort_order: 0 });
  const read = await request(app).get('/bids/41');
  expect(read.status).toBe(200);
  expect(read.body).toMatchObject({ markup_pct: '18.00', totals: { markup: 18000, total: 118000 } });
  expect(bids.get(41)).toEqual(saved);

  const updated = await request(app).put('/bids/41').send({ title: 'Revised title' });
  expect(updated.status).toBe(200);
  expect(updated.body).toMatchObject({ title: 'Revised title', markup_pct: '18.00', notes: 'Saved terms',
    totals: { markup: 18000, total: 118000 } });
  expect(updated.body.items).toEqual(read.body.items);
});
