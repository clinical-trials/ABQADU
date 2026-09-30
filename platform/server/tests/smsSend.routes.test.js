const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

jest.mock('twilio', () => jest.fn());
let directory;
let storeFile;
let previousEnv;
let app;
let providerSend;
const recipient = '+15055550123';

function saveFixture(preferences = []) {
  fs.writeFileSync(storeFile, JSON.stringify({
    projects: [], activity: [{ id: 'existing-note', type: 'Note', detail: 'Existing fixture note' }],
    sms_contact_preferences: preferences,
  }));
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-sms-send-'));
  storeFile = path.join(directory, 'store.json');
  previousEnv = { ...process.env };
  Object.assign(process.env, {
    COMMAND_CENTER_STORE_PATH: storeFile,
    TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
    TWILIO_AUTH_TOKEN: 'fixture-only',
    TWILIO_FROM_NUMBER: '+15055550100',
  });
  saveFixture();
  jest.resetModules();
  providerSend = jest.fn(async () => ({ sid: 'SM_fixture', status: 'queued' }));
  require('twilio').mockReturnValue({ messages: { create: providerSend } });
  const express = require('express');
  app = express();
  app.use(express.json());
  app.use('/api/integrations', require('../src/routes/productionIntegrations'));
});
afterEach(() => {
  process.env = previousEnv;
  fs.rmSync(directory, { recursive: true, force: true });
});

test.each([recipient, '(505) 555-0123', '1-505-555-0123'])('saved opt-out blocks recipient %s before sending or logging', async to => {
  saveFixture([{ phone: recipient, opted_out: true }]);
  const before = fs.readFileSync(storeFile, 'utf8');
  const response = await request(app).post('/api/integrations/sms/send').send({ to, body: 'Review the fixture schedule.' });
  expect(response.status).toBe(409);
  expect(response.body.error).toMatch(/opted out/i);
  expect(providerSend).not.toHaveBeenCalled();
  expect(fs.readFileSync(storeFile, 'utf8')).toBe(before);
});

test.each([
  { to: 'not a phone', body: 'Fixture' },
  { to: 15055550123, body: 'Fixture' },
  { body: 'Fixture' },
  { to: recipient, body: '   ' },
  { to: recipient, body: { text: 'Fixture' } },
  { to: recipient, body: 'x'.repeat(1601) },
  { to: recipient, body: 'Control\u0000character' },
])('invalid SMS input is rejected before sending or logging: %j', async body => {
  const before = fs.readFileSync(storeFile, 'utf8');
  const response = await request(app).post('/api/integrations/sms/send').send(body);
  expect(response.status).toBe(400);
  expect(providerSend).not.toHaveBeenCalled();
  expect(fs.readFileSync(storeFile, 'utf8')).toBe(before);
});

test('explicit send to a permitted recipient normalizes the number and records successful submission', async () => {
  saveFixture([{ phone: recipient, opted_out: false }]);
  const response = await request(app).post('/api/integrations/sms/send')
    .send({ to: '(505) 555-0123', body: '  Review the fixture schedule.  ' });
  expect(response.status).toBe(201);
  expect(providerSend).toHaveBeenCalledTimes(1);
  expect(providerSend).toHaveBeenCalledWith({ from: '+15055550100', to: recipient, body: 'Review the fixture schedule.' });
  const saved = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  expect(saved.activity[0]).toMatchObject({ type: 'SMS sent', detail: `SMS sent to ${recipient}` });
  expect(saved.activity[1].id).toBe('existing-note');
  expect(saved.sms_contact_preferences).toEqual([{ phone: recipient, opted_out: false }]);
});

test('a newly saved opt-out is honored by the next explicit send', async () => {
  expect((await request(app).post('/api/integrations/sms/send').send({ to: recipient, body: 'First fixture' })).status).toBe(201);
  saveFixture([{ phone: recipient, opted_out: true }]);
  expect((await request(app).post('/api/integrations/sms/send').send({ to: recipient, body: 'Second fixture' })).status).toBe(409);
  expect(providerSend).toHaveBeenCalledTimes(1);
});

test('unreadable contact preferences fail before any provider request', async () => {
  fs.writeFileSync(storeFile, '{broken-json');
  const response = await request(app).post('/api/integrations/sms/send').send({ to: recipient, body: 'Fixture' });
  expect(response.status).toBe(500);
  expect(providerSend).not.toHaveBeenCalled();
  expect(fs.readFileSync(storeFile, 'utf8')).toBe('{broken-json');
});
