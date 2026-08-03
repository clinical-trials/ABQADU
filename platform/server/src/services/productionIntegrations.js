const crypto = require('crypto');

const REQUIRED = {
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_SUCCESS_URL', 'STRIPE_CANCEL_URL'],
  twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
  ocr: ['OCR_SPACE_API_KEY'],
  clerk: ['CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'],
  invoiceshelf: ['INVOICESHELF_BASE_URL', 'INVOICESHELF_API_TOKEN', 'INVOICESHELF_COMPANY_ID'],
};

function configured(keys) {
  return keys.every(k => Boolean(process.env[k]));
}

function providerStatus(name) {
  const required = REQUIRED[name] || [];
  const missing = required.filter(k => !process.env[k]);
  return {
    configured: missing.length === 0,
    missing,
    required_env: required,
  };
}

function getIntegrationStatus() {
  return {
    stripe: providerStatus('stripe'),
    twilio: providerStatus('twilio'),
    ocr: providerStatus('ocr'),
    clerk: providerStatus('clerk'),
    invoiceshelf: providerStatus('invoiceshelf'),
  };
}

function parseUsDate(value) {
  const match = String(value || '').match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (!match) return null;
  const month = match[1].padStart(2, '0');
  const day = match[2].padStart(2, '0');
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
}

function inferCategory(text) {
  const body = String(text || '').toLowerCase();
  if (/(mile|fuel|gasoline|shell|chevron|circle k)/.test(body)) return 'Mileage / Vehicle';
  if (/(toilet|sink|faucet|vanity|shower|dishwasher|fridge|range|appliance|fixture)/.test(body)) return 'Fixtures';
  if (/(permit|city|inspection|plan review)/.test(body)) return 'Permitting';
  if (/(labor|crew|subcontractor|install)/.test(body)) return 'Labor';
  return 'Materials';
}

function parseReceiptText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const joined = lines.join('\n');
  const totalMatches = [...joined.matchAll(/(?:total|amount|balance)\s*[:$ ]+\$?\s*([0-9,]+\.\d{2})/gi)];
  const fallbackAmounts = [...joined.matchAll(/\$?\s*([0-9,]+\.\d{2})/g)];
  const totalRaw = (totalMatches.at(-1) || fallbackAmounts.at(-1) || [])[1];
  const date = parseUsDate(joined);
  const vendor = lines.find(line => !/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line) && !/total|amount|balance/i.test(line)) || 'Unknown vendor';

  return {
    vendor,
    date,
    total: totalRaw ? Number(totalRaw.replace(/,/g, '')) : 0,
    category: inferCategory(joined),
    confidence: totalRaw ? 'review' : 'low',
    raw_text: text || '',
  };
}

async function postStripeCheckout({ amount, description, client_email, metadata = {} }, fetchImpl = global.fetch) {
  if (!configured(REQUIRED.stripe)) {
    const err = new Error('Stripe is not configured');
    err.status = 409;
    err.details = providerStatus('stripe');
    throw err;
  }
  const cents = Math.round(Number(amount || 0) * 100);
  if (!Number.isFinite(cents) || cents < 50) {
    const err = new Error('Stripe checkout amount must be at least $0.50');
    err.status = 400;
    throw err;
  }
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', process.env.STRIPE_SUCCESS_URL);
  form.set('cancel_url', process.env.STRIPE_CANCEL_URL);
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', 'usd');
  form.set('line_items[0][price_data][unit_amount]', String(cents));
  form.set('line_items[0][price_data][product_data][name]', description || 'ABQ ADU invoice payment');
  if (client_email) form.set('customer_email', client_email);
  Object.entries(metadata).forEach(([key, value]) => form.set(`metadata[${key}]`, String(value)));

  const res = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  const payload = await res.json();
  if (!res.ok) {
    const err = new Error(payload?.error?.message || `Stripe checkout failed with ${res.status}`);
    err.status = 502;
    err.details = payload;
    throw err;
  }
  return payload;
}

async function sendSms({ to, body }) {
  if (!configured(REQUIRED.twilio)) {
    const err = new Error('Twilio SMS is not configured');
    err.status = 409;
    err.details = providerStatus('twilio');
    throw err;
  }
  if (!to || !body) {
    const err = new Error('SMS requires both to and body');
    err.status = 400;
    throw err;
  }
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client.messages.create({
    from: process.env.TWILIO_FROM_NUMBER,
    to,
    body,
  });
}

async function ocrSpaceReceipt({ image_base64, image_url, raw_text }, fetchImpl = global.fetch) {
  if (raw_text) return parseReceiptText(raw_text);
  if (!configured(REQUIRED.ocr)) {
    const err = new Error('OCR provider is not configured');
    err.status = 409;
    err.details = providerStatus('ocr');
    throw err;
  }
  if (!image_base64 && !image_url) {
    const err = new Error('Receipt OCR requires raw_text, image_base64, or image_url');
    err.status = 400;
    throw err;
  }
  const form = new URLSearchParams();
  form.set('apikey', process.env.OCR_SPACE_API_KEY);
  form.set('language', 'eng');
  form.set('isOverlayRequired', 'false');
  form.set('detectOrientation', 'true');
  if (image_url) form.set('url', image_url);
  if (image_base64) form.set('base64Image', image_base64.startsWith('data:') ? image_base64 : `data:image/png;base64,${image_base64}`);

  const res = await fetchImpl('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const payload = await res.json();
  if (!res.ok || payload?.IsErroredOnProcessing) {
    const err = new Error(payload?.ErrorMessage?.[0] || `OCR failed with ${res.status}`);
    err.status = 502;
    err.details = payload;
    throw err;
  }
  const parsedText = payload?.ParsedResults?.map(r => r.ParsedText).join('\n') || '';
  return parseReceiptText(parsedText);
}

function verifyClerkShape(token) {
  if (!token || token.split('.').length !== 3) return null;
  const [, payload] = token.split('.');
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(normalized, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function makeWebhookSignature(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

module.exports = {
  REQUIRED,
  getIntegrationStatus,
  parseReceiptText,
  postStripeCheckout,
  sendSms,
  ocrSpaceReceipt,
  verifyClerkShape,
  makeWebhookSignature,
};
