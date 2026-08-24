const fs = require('fs/promises');
const path = require('path');
const { MODEL_CATALOG, applyModelDefaults } = require('./modelCatalog');

const storePath = process.env.COMMAND_CENTER_STORE_PATH ||
  path.join(__dirname, '..', '..', 'data', 'version10-command-center.json');

function nowIso() {
  return new Date().toISOString();
}

function starterState() {
  const projects = [
    {
      id: 'amherst-altura',
      client: 'Amherst homeowner',
      address: '435 Amherst Dr NE, Albuquerque, NM 87106',
      model: 'Altura',
      sqft: 600,
      bid_total: 185000,
      cogs_low: 90000,
      cogs_high: 102000,
      confidence: 'A-',
      status: 'Ready to send',
      next_action: 'Confirm client approval, then issue the $10,000 preconstruction invoice.',
      client_phone: '505-977-7659',
      client_email: '',
      preferred_contact: 'Phone',
      best_contact_time: 'Morning',
      site_visit_status: 'Completed',
      utility_review_status: 'Needs confirmation',
      sewer_confirmation_status: 'Needs sewer confirmation study',
      setbacks_site_plan_status: 'Needs site plan',
    },
    {
      id: 'mackland-altura',
      client: 'Mackland homeowner',
      address: '4027 Mackland Ave NE, Albuquerque, NM',
      model: 'Altura 2BR',
      sqft: 650,
      bid_total: 185250,
      cogs_low: 97500,
      cogs_high: 110500,
      confidence: 'B+',
      status: 'Needs supplier comparison',
      next_action: 'Compare SIP/PUR panel order against Lowe’s, RAKS, and Rio Grande conventional takeoff.',
      client_phone: '505-977-7659',
      client_email: '',
      preferred_contact: 'Phone',
      best_contact_time: 'Morning',
      site_visit_status: 'Completed',
      utility_review_status: 'Needs confirmation',
      sewer_confirmation_status: 'Needs sewer confirmation study',
      setbacks_site_plan_status: 'Needs site plan',
    },
  ].map(project => applyModelDefaults(project, project.model));

  return {
    version: 'Version 10',
    updated_at: nowIso(),
    model_catalog: MODEL_CATALOG,
    builder: {
      company: 'ABQ ADU',
      phone: '505-977-7659',
      address: '131 Madison NE, Albuquerque, NM 87108',
    },
    projects,
    supplier_quotes: [
      {
        id: 'lowes-12th',
        supplier: "Lowe's Pro Desk - 12th Street",
        package: 'Appliances, fixtures, windows, lumber, sheetrock, mud, house wrap',
        status: 'Quote requested',
        delivery: 'Job-site delivery required',
        quoted_total: 0,
        next_action: 'Send model, dimensions, window/door schedule, and appliance list.',
      },
      {
        id: 'raks-los-lunas',
        supplier: 'RAKS Building Supply - Jonathan Baca',
        package: 'Windows, doors, lumber, framing supplies',
        status: 'Needs outreach',
        delivery: 'Confirm availability and delivery price',
        quoted_total: 2100,
        next_action: 'Ask for Alpine window package and delivery lead time.',
      },
      {
        id: 'muras-panels',
        supplier: 'Muras SIP/PUR Panels',
        package: 'Panelized shell: framing, exterior sheathing, insulation, exterior framing',
        status: 'Compare labor savings',
        delivery: 'Panel delivery and crane/crew coordination',
        quoted_total: 16000,
        next_action: 'Compare higher material cost against reduced framing labor and schedule compression.',
      },
    ],
    receipts: [
      { id: 'receipt-1', vendor: 'Lowe’s', project: 'Amherst Altura', amount: 71, category: 'Fixtures', note: 'Kitchen sink allowance starter receipt.' },
      { id: 'receipt-2', vendor: 'Kohler', project: 'Amherst Altura', amount: 219, category: 'Fixtures', note: 'Toilet allowance example.' },
    ],
    mileage: [
      { id: 'mile-1', date: '2026-08-03', project: 'Amherst Altura', miles: 18.4, purpose: 'Site visit and utility review.' },
      { id: 'mile-2', date: '2026-08-03', project: 'Mackland Altura', miles: 12.1, purpose: 'Supplier coordination and plan review.' },
    ],
    activity: [
      { id: 'activity-1', type: 'Client view', detail: 'Amherst estimate client view simulated.', at: nowIso() },
      { id: 'activity-2', type: 'Supplier', detail: 'RAKS window package needs second quote.', at: nowIso() },
      { id: 'activity-3', type: 'Weather/code', detail: 'Check Albuquerque/Santa Fe AHJ code cycle before permit handoff.', at: nowIso() },
    ],
    weather_checks: [
      {
        id: 'weather-starter',
        project: 'Amherst Altura',
        zip: '87106',
        source: 'wttr.in',
        location: 'Albuquerque, New Mexico',
        risk_level: 'low',
        delay_days: 0,
        crew_message: 'Weather risk for 87106: LOW risk. Keep crews on the current critical path.',
        checked_at: nowIso(),
        risks: [],
      },
    ],
    message_drafts: [
      {
        id: 'msg-ian-daily',
        label: 'Text Ian daily triage',
        body: 'Version 10 builder triage: Amherst is ready to send, Mackland needs supplier comparison, and the $10,000 preconstruction invoice remains the first payment gate.',
      },
      {
        id: 'msg-supplier',
        label: 'Text supplier bidout',
        body: 'Please quote the ADU materials package with job-site delivery: lumber, sheetrock, mud, house wrap, roofing, windows/doors, cabinets, appliances, fixtures, lighting, and flooring.',
      },
    ],
  };
}

async function ensureStore() {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    await fs.writeFile(storePath, JSON.stringify(starterState(), null, 2));
  }
}

async function loadCommandCenter() {
  await ensureStore();
  const raw = await fs.readFile(storePath, 'utf8');
  return JSON.parse(raw);
}

async function saveCommandCenter(nextState) {
  const current = await loadCommandCenter();
  const saved = {
    ...current,
    ...nextState,
    version: 'Version 10',
    updated_at: nowIso(),
  };
  await fs.writeFile(storePath, JSON.stringify(saved, null, 2));
  return saved;
}

async function resetCommandCenter() {
  const reset = starterState();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(reset, null, 2));
  return reset;
}

module.exports = {
  loadCommandCenter,
  saveCommandCenter,
  resetCommandCenter,
  starterState,
  storePath,
};
