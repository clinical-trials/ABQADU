const { randomBytes, randomUUID } = require('node:crypto');
const twilio = require('twilio');
const { saveCommandCenter } = require('./commandCenterStore');

const OWNED_FIELDS = ['bid_requests', 'sms_inbox', 'weather_holds', 'sms_contact_preferences'];
const INBOUND_PATH = '/api/contractor-desk/sms/inbound';
const REQUIRED = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'TWILIO_INBOUND_URL'];
const MAX_RECORDS = 10000;
const DAY = 86400000;

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function text(value, field, max, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    fail(400, `${field} must contain ${optional ? 'at most' : '1 to'} ${max} characters.`);
  }
  return value.trim();
}

function normalizePhone(value) {
  const phone = text(value, 'Contact phone', 32).replace(/[\s().-]/g, '');
  if (/^\d{10}$/.test(phone)) return `+1${phone}`;
  if (/^1\d{10}$/.test(phone)) return `+${phone}`;
  if (/^\+[1-9]\d{7,14}$/.test(phone)) return phone;
  fail(400, 'Enter a valid contact phone number, including its country code outside the US.');
}

function abqToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
}

function dateWithin(value, field, maxDays, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, `${field} must use YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(400, `${field} must be a valid calendar date.`);
  const today = new Date(`${abqToday()}T00:00:00Z`).getTime();
  const daysAhead = (parsed.getTime() - today) / DAY;
  if (daysAhead < 0 || daysAhead > maxDays) fail(400, `${field} must be between today and ${maxDays} days from today in Albuquerque.`);
  return value;
}

function projectFor(state, id) {
  const project = (state.projects || []).find(row => row.id === id);
  if (!project) fail(404, 'Project not found');
  return project;
}

function rowsFor(state, field) {
  return Array.isArray(state[field]) ? state[field] : [];
}

function hasRoom(rows) {
  if (rows.length >= MAX_RECORDS) fail(503, 'The contractor desk record limit has been reached. Archive records before adding more.');
}

function readInboundConfig(env = process.env) {
  const account = String(env.TWILIO_ACCOUNT_SID || '').trim();
  const token = String(env.TWILIO_AUTH_TOKEN || '').trim();
  const phone = String(env.TWILIO_FROM_NUMBER || '').trim();
  // Preserve the configured URL exactly for signature validation, including its query.
  const url = String(env.TWILIO_INBOUND_URL || '').trim();
  const valid = {
    TWILIO_ACCOUNT_SID: /^AC[0-9a-f]{32}$/i.test(account),
    TWILIO_AUTH_TOKEN: Boolean(token),
    TWILIO_FROM_NUMBER: /^\+[1-9]\d{7,14}$/.test(phone),
    TWILIO_INBOUND_URL: false,
  };
  try {
    const parsed = new URL(url);
    valid.TWILIO_INBOUND_URL = parsed.protocol === 'https:' && parsed.pathname === INBOUND_PATH && !parsed.username && !parsed.password && !parsed.hash;
  } catch { /* Missing or invalid configuration remains closed. */ }
  const missing = REQUIRED.filter(name => !valid[name]);
  return { account, token, phone, url, missing, configured: missing.length === 0 };
}

function inboundStatus(env = process.env) {
  const config = readInboundConfig(env);
  return { inbound_configured: config.configured, phone: config.configured ? config.phone : null, missing: config.missing };
}

async function createBidRequest(body = {}, env = process.env) {
  const input = {
    project_id: text(body.project_id, 'Project', 120),
    trade: text(body.trade, 'Trade', 80),
    title: text(body.title, 'Request title', 160),
    scope: text(body.scope, 'Scope', 4000),
    due_date: dateWithin(body.due_date, 'Quote due date', 365, true),
    contact_name: text(body.contact_name, 'Contact name', 120),
    contact_phone: normalizePhone(body.contact_phone),
  };
  return saveCommandCenter(current => {
    const project = projectFor(current, input.project_id);
    const rows = rowsFor(current, 'bid_requests');
    hasRoom(rows);
    const preferences = rowsFor(current, 'sms_contact_preferences');
    if (preferences.some(row => row.phone === input.contact_phone && row.opted_out)) fail(409, 'This contact has opted out of text messages. Use another contact method.');
    let reference;
    do { reference = `BID-${randomBytes(4).toString('hex').toUpperCase()}`; } while (rows.some(row => row.reference === reference));
    const receiving = inboundStatus(env);
    const reply = receiving.inbound_configured
      ? `Text your quote to ${receiving.phone} and include ${reference} so we can match your reply.`
      : `Include ${reference} with your quote. Platform text replies are not connected yet.`;
    const row = {
      id: `bid-request-${randomUUID()}`, reference, ...input, status: 'Draft', created_at: new Date().toISOString(),
      message_body: `ABQ ADU bid request ${reference}\n${input.title}\nTrade: ${input.trade}\nProject: ${project.address || project.client || input.project_id}\n${input.scope}${input.due_date ? `\nQuote requested by ${input.due_date}.` : ''}\n${reply}`,
    };
    return { bid_requests: [row, ...rows] };
  });
}

async function createWeatherHold(body = {}) {
  const input = {
    project_id: text(body.project_id, 'Project', 120),
    trade: text(body.trade, 'Trade', 80),
    date: dateWithin(body.date, 'Hold date', 10),
    note: text(body.note, 'Hold note', 2000),
  };
  return saveCommandCenter(current => {
    const project = projectFor(current, input.project_id);
    const rows = rowsFor(current, 'weather_holds');
    hasRoom(rows);
    return { weather_holds: [{
      id: `weather-hold-${randomUUID()}`, ...input, status: 'Confirmed', created_at: new Date().toISOString(),
      message_body: `ABQ ADU schedule update: ${input.trade} is on hold for ${input.date} at ${project.address || project.client || input.project_id}. ${input.note} Please confirm the revised plan with the builder.`,
    }, ...rows] };
  });
}

async function cancelWeatherHold(id) {
  const holdId = text(id, 'Weather hold', 120);
  return saveCommandCenter(current => {
    const rows = rowsFor(current, 'weather_holds');
    const hold = rows.find(row => row.id === holdId);
    if (!hold) fail(404, 'Weather hold not found');
    if (hold.status === 'Cancelled') return {};
    return { weather_holds: rows.map(row => row.id === holdId
      ? { ...row, status: 'Cancelled', cancelled_at: new Date().toISOString() }
      : row) };
  });
}

async function reviewSms(id, body = {}) {
  const messageId = text(id, 'Message', 120);
  const projectId = text(body.project_id, 'Project', 120);
  return saveCommandCenter(current => {
    projectFor(current, projectId);
    const inbox = rowsFor(current, 'sms_inbox');
    const message = inbox.find(row => row.id === messageId);
    if (!message) fail(404, 'Message not found');
    if (message.status === 'Reviewed' && message.project_id === projectId) return {};
    const bid = rowsFor(current, 'bid_requests').find(row => row.id === message.bid_request_id);
    return { sms_inbox: inbox.map(row => row.id === messageId ? {
      ...row, project_id: projectId, status: 'Reviewed', reviewed_at: new Date().toISOString(),
      bid_request_id: bid?.project_id === projectId ? bid.id : null,
    } : row) };
  });
}

function validateInbound(params, signature, env) {
  const config = readInboundConfig(env);
  if (!config.configured) fail(503, 'Inbound text messages are not configured.');
  if (!params || typeof params !== 'object' || Array.isArray(params) || Object.values(params).some(value => typeof value !== 'string')) fail(400, 'Expected form-encoded message fields.');
  // Every supplied field participates; never reconstruct from a hardcoded list.
  if (typeof signature !== 'string' || !twilio.validateRequest(config.token, signature, config.url, params)) fail(403, 'Invalid message signature.');
  if (params.AccountSid !== config.account || params.To !== config.phone) fail(403, 'Message destination is not configured for this workspace.');
  if (!/^(?:SM|MM)[0-9a-f]{32}$/i.test(params.MessageSid || '') || !/^\+[1-9]\d{7,14}$/.test(params.From || '')
    || typeof params.Body !== 'string' || params.Body.length > 4096
    || (params.NumMedia !== undefined && !/^(?:[0-9]|10)$/.test(params.NumMedia))) fail(400, 'Invalid inbound message fields.');
  if (!params.Body.trim() && !(Number(params.NumMedia) > 0)) fail(400, 'Inbound message is empty.');
  return params;
}

async function receiveSms(params, signature, env = process.env) {
  validateInbound(params, signature, env);
  await saveCommandCenter(current => {
    const inbox = rowsFor(current, 'sms_inbox');
    if (inbox.some(row => row.provider_sid === params.MessageSid)) return {};
    hasRoom(inbox);
    const references = [...new Set(params.Body.toUpperCase().match(/\bBID-[A-Z0-9]{8}\b/g) || [])];
    const reference = references.length === 1 ? references[0] : null;
    const matches = rowsFor(current, 'bid_requests').filter(row => row.reference === reference && row.contact_phone === params.From
      && (current.projects || []).some(project => project.id === row.project_id));
    const match = matches.length === 1 ? matches[0] : null;
    const command = String(params.OptOutType || params.Body.trim()).toUpperCase();
    const optedOut = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/.test(command) ? true : /^(START|UNSTOP)$/.test(command) ? false : null;
    const receivedAt = new Date().toISOString();
    const row = {
      id: `sms-${params.MessageSid}`, provider_sid: params.MessageSid,
      from: params.From, to: params.To, body: params.Body,
      received_at: receivedAt, project_id: match?.project_id || null, bid_request_id: match?.id || null,
      reference, status: 'Needs review', media_count: Number(params.NumMedia || 0),
      ...(optedOut === null ? {} : { opt_out: optedOut }),
    };
    const patch = { sms_inbox: [row, ...inbox] };
    if (optedOut !== null) {
      patch.sms_contact_preferences = [{ phone: params.From, opted_out: optedOut, updated_at: receivedAt, provider_sid: params.MessageSid },
        ...rowsFor(current, 'sms_contact_preferences').filter(item => item.phone !== params.From)];
    }
    return patch;
  });
}

module.exports = { OWNED_FIELDS, inboundStatus, createBidRequest, createWeatherHold, cancelWeatherHold, reviewSms, receiveSms };
