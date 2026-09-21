const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const request = require('supertest');
const { Pool } = require('pg');

jest.mock('../src/db', () => ({ pool: { query: jest.fn(), connect: jest.fn() } }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));
const databaseBoundary = require('../src/db').pool;

const database = process.env.BILLING_TEST_DATABASE_URL;
(database ? describe : describe.skip)('InvoiceShelf edit guards with real PostgreSQL locks', () => {
  let admin, pool, app, clientId, bidId;
  const schema = `shelf_guard_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  beforeAll(async () => {
    admin = new Pool({ connectionString: database });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: database, options: `-c search_path=${schema}`, application_name: schema, max: 5 });
    await pool.query('CREATE TABLE projects (id SERIAL PRIMARY KEY); CREATE TABLE designs (id SERIAL PRIMARY KEY, name TEXT, rooms JSONB)');
    for (const file of ['005_bidding_invoicing.sql', '006_invoice_engine_sync.sql']) {
      await pool.query(await fs.readFile(path.join(__dirname, '../src/migrations', file), 'utf8'));
    }
    databaseBoundary.query.mockImplementation((...args) => pool.query(...args));
    databaseBoundary.connect.mockImplementation(() => pool.connect());
    app = express();
    app.use(express.json());
    app.use('/clients', require('../src/routes/clients'));
    app.use('/bids', require('../src/routes/bids'));
    app.use((error, req, res, next) => res.status(error.status || 500).json({ error: 'Request failed' }));
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE clients,bids,bid_line_items RESTART IDENTITY CASCADE');
    clientId = (await pool.query("INSERT INTO clients(name,email,phone,address,notes) VALUES ('Saved client','saved@example.test','5055550100','Saved address','Saved client notes') RETURNING id")).rows[0].id;
    bidId = (await pool.query("INSERT INTO bids(client_id,title,bid_number,notes,valid_until) VALUES ($1,'Saved bid','BID-0001','Saved bid notes','2026-12-01') RETURNING id", [clientId])).rows[0].id;
    await pool.query("INSERT INTO bid_line_items(bid_id,description,qty,unit_cost) VALUES ($1,'Saved line',2,50)", [bidId]);
  });
  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  test.each(['pending', 'mapped'])('%s customer exports block edits and deletion without changing the snapshot', async state => {
    await pool.query('UPDATE clients SET invoiceshelf_sync_error=$1,invoiceshelf_customer_id=$2 WHERE id=$3', [state === 'pending' ? 'Reserved' : null, state === 'mapped' ? '91' : null, clientId]);
    const update = await request(app).put(`/clients/${clientId}`).send({ name: 'Changed', status: 'won' });
    expect(update.status).toBe(409);
    expect(update.body.error).toMatch(/InvoiceShelf/);
    expect((await request(app).delete(`/clients/${clientId}`)).status).toBe(409);
    expect((await pool.query('SELECT name,email,notes FROM clients WHERE id=$1', [clientId])).rows[0]).toEqual({ name: 'Saved client', email: 'saved@example.test', notes: 'Saved client notes' });
  });

  test('an unsynced client status change preserves omitted contact fields', async () => {
    const response = await request(app).put(`/clients/${clientId}`).send({ status: 'won' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'won', email: 'saved@example.test', phone: '5055550100', address: 'Saved address', notes: 'Saved client notes' });
  });

  test.each(['pending', 'mapped'])('%s estimate exports block header/item edits and deletion', async state => {
    await pool.query('UPDATE bids SET invoiceshelf_sync_error=$1,invoiceshelf_estimate_id=$2 WHERE id=$3', [state === 'pending' ? 'Reserved' : null, state === 'mapped' ? '81' : null, bidId]);
    const response = await request(app).put(`/bids/${bidId}`).send({ title: 'Changed', items: [{ description: 'New', unit_cost: 1 }] });
    expect(response.status).toBe(409);
    expect((await request(app).delete(`/bids/${bidId}`)).status).toBe(409);
    expect((await pool.query('SELECT title,notes FROM bids WHERE id=$1', [bidId])).rows[0]).toEqual({ title: 'Saved bid', notes: 'Saved bid notes' });
    expect((await pool.query('SELECT description FROM bid_line_items WHERE bid_id=$1', [bidId])).rows).toEqual([{ description: 'Saved line' }]);
  });

  test.each(['pending', 'mapped'])('%s estimates still allow unchanged editor saves and status updates', async state => {
    await pool.query('UPDATE bids SET invoiceshelf_sync_error=$1,invoiceshelf_estimate_id=$2 WHERE id=$3', [state === 'pending' ? 'Reserved' : null, state === 'mapped' ? '81' : null, bidId]);
    const saved = (await request(app).get(`/bids/${bidId}`)).body;
    const before = (await pool.query('SELECT xmin::text AS version FROM bids WHERE id=$1', [bidId])).rows[0].version;
    const fullPayload = { ...saved, markup_pct: Number(saved.markup_pct), tax_pct: Number(saved.tax_pct),
      contingency_pct: Number(saved.contingency_pct), items: saved.items.map(item => ({ ...item,
        category: item.category || '', qty: Number(item.qty), unit_cost: Number(item.unit_cost) })) };
    const noop = await request(app).put(`/bids/${bidId}`).send(fullPayload);
    expect(noop.status).toBe(200);
    expect(noop.body.items).toEqual(saved.items);
    expect((await pool.query('SELECT xmin::text AS version FROM bids WHERE id=$1', [bidId])).rows[0].version).toBe(before);
    const status = await request(app).put(`/bids/${bidId}`).send({ status: 'accepted' });
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ status: 'accepted', notes: 'Saved bid notes' });
    expect(status.body.items).toEqual(saved.items);
    expect(status.body.valid_until).toBe(saved.valid_until);
    const changed = await request(app).put(`/bids/${bidId}`).send({ ...fullPayload, items: fullPayload.items.map(item => ({ ...item, unit_cost: 51 })) });
    expect(changed.status).toBe(409);
    expect((await request(app).get(`/bids/${bidId}`)).body.items).toEqual(saved.items);
  });

  test('bid status-only updates preserve notes/dates and item-only updates advance the parent snapshot', async () => {
    const status = await request(app).put(`/bids/${bidId}`).send({ status: 'accepted' });
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ status: 'accepted', notes: 'Saved bid notes' });
    expect(status.body.valid_until.slice(0, 10)).toBe('2026-12-01');
    const before = (await pool.query('SELECT xmin::text AS version FROM bids WHERE id=$1', [bidId])).rows[0].version;
    const edit = await request(app).put(`/bids/${bidId}`).send({ items: [{ description: 'New line', qty: 3, unit_cost: 10 }] });
    expect(edit.status).toBe(200);
    expect(edit.body.items).toHaveLength(1);
    expect(edit.body.items[0]).toMatchObject({ description: 'New line', qty: '3.00', unit_cost: '10.00' });
    expect((await pool.query('SELECT xmin::text AS version FROM bids WHERE id=$1', [bidId])).rows[0].version).not.toBe(before);
  });

  test('a failed replacement rolls back the bid header and all original items', async () => {
    const response = await request(app).put(`/bids/${bidId}`).send({ title: 'Changed', items: [{ description: 'Valid new line' }, { description: null }] });
    expect(response.status).toBe(500);
    expect((await pool.query('SELECT title FROM bids WHERE id=$1', [bidId])).rows[0].title).toBe('Saved bid');
    expect((await pool.query('SELECT description FROM bid_line_items WHERE bid_id=$1', [bidId])).rows).toEqual([{ description: 'Saved line' }]);
  });

  test('a failed initial line insert does not publish a partial new bid', async () => {
    const response = await request(app).post('/bids').send({ title: 'Partial bid', client_id: clientId, items: [{ description: null }] });
    expect(response.status).toBe(500);
    expect((await pool.query('SELECT title FROM bids ORDER BY id')).rows).toEqual([{ title: 'Saved bid' }]);
  });

  test('a failed design-derived line insert also rolls back the unpublished bid', async () => {
    const design = (await pool.query("INSERT INTO designs(name,rooms) VALUES ('Saved design','[]') RETURNING id")).rows[0];
    require('../src/services/bomGenerator').generateBOM.mockReturnValue({ totalSf: 400, items: [{ label: null, qty: 1, costPerUnit: 10 }] });
    const response = await request(app).post(`/bids/from-design/${design.id}`).send({ client_id: clientId });
    expect(response.status).toBe(500);
    expect((await pool.query('SELECT title FROM bids ORDER BY id')).rows).toEqual([{ title: 'Saved bid' }]);
  });

  test('an edit waiting behind an export reservation rechecks the locked row', async () => {
    const exporting = await pool.connect();
    let response;
    try {
      await exporting.query('BEGIN');
      await exporting.query('SELECT id FROM bids WHERE id=$1 FOR UPDATE', [bidId]);
      response = request(app).put(`/bids/${bidId}`).send({ title: 'Racing edit' }).then(result => result);
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await admin.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM bids%FOR UPDATE'", [schema]);
        if (result.rows.length) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      await exporting.query("UPDATE bids SET invoiceshelf_sync_error='Reserved' WHERE id=$1", [bidId]);
      await exporting.query('COMMIT');
      expect((await response).status).toBe(409);
      expect((await pool.query('SELECT title FROM bids WHERE id=$1', [bidId])).rows[0].title).toBe('Saved bid');
    } finally {
      await exporting.query('ROLLBACK'); exporting.release();
      if (response) await response;
    }
  });
});
