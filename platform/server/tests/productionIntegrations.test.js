const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, '..', 'src', 'index.js');
const routeFile = path.join(__dirname, '..', 'src', 'routes', 'productionIntegrations.js');
const serviceFile = path.join(__dirname, '..', 'src', 'services', 'productionIntegrations.js');

function assertIncludes(file, text) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes(text)) throw new Error(`${file} missing ${text}`);
}

test('production integration routes are registered', () => {
  assertIncludes(indexFile, "app.use('/api/integrations'");
  assertIncludes(routeFile, "router.get('/status'");
  assertIncludes(routeFile, "router.post('/sms/send'");
  assertIncludes(routeFile, "router.post('/stripe/checkout'");
  assertIncludes(routeFile, "router.post('/ocr/receipt'");
  assertIncludes(routeFile, "router.get('/clerk/status'");
});

test('receipt parser extracts vendor date total and likely category', () => {
  const { parseReceiptText } = require('../src/services/productionIntegrations');
  const parsed = parseReceiptText(`LOWE'S HOME IMPROVEMENT
08/03/2026
Drywall mud and house wrap
TOTAL $284.76`);

  expect(parsed.vendor).toBe("LOWE'S HOME IMPROVEMENT");
  expect(parsed.date).toBe('2026-08-03');
  expect(parsed.total).toBe(284.76);
  expect(parsed.category).toBe('Materials');
});

test('integration status reports configured and missing providers', () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_demo';
  process.env.STRIPE_SUCCESS_URL = 'https://example.com/success';
  process.env.STRIPE_CANCEL_URL = 'https://example.com/cancel';
  delete process.env.TWILIO_ACCOUNT_SID;
  jest.resetModules();
  const { getIntegrationStatus } = require('../src/services/productionIntegrations');
  const status = getIntegrationStatus();

  expect(status.stripe.configured).toBe(true);
  expect(status.twilio.configured).toBe(false);
  expect(status.clerk.required_env).toContain('CLERK_PUBLISHABLE_KEY');
});

describe('receipt project attribution', () => {
  let store;
  let handler;
  let directory;
  let originalStorePath;
  let ocrProvider;
  const rawText = "LOWE'S HOME IMPROVEMENT\n08/03/2026\nTOTAL $284.76";

  beforeEach(async () => {
    originalStorePath = process.env.COMMAND_CENTER_STORE_PATH;
    directory = fs.mkdtempSync(path.join(require('os').tmpdir(), 'abqadu-receipt-project-'));
    process.env.COMMAND_CENTER_STORE_PATH = path.join(directory, 'store.json');
    jest.resetModules();
    store = require('../src/services/commandCenterStore');
    await store.resetCommandCenter();
    ocrProvider = jest.spyOn(require('../src/services/productionIntegrations'), 'ocrSpaceReceipt');
    const router = require('../src/routes/productionIntegrations');
    handler = router.stack.find(layer => layer.route?.path === '/ocr/receipt').route.stack[0].handle;
  });

  afterEach(() => {
    ocrProvider.mockRestore();
    if (originalStorePath === undefined) delete process.env.COMMAND_CENTER_STORE_PATH;
    else process.env.COMMAND_CENTER_STORE_PATH = originalStorePath;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function parseReceipt(body) {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    await handler({ body: { raw_text: rawText, ...body } }, response);
    return response;
  }

  test('scanned receipts persist the selected project id and saved client name', async () => {
    const response = await parseReceipt({ project_id: 'mackland-altura', project: 'Amherst homeowner' });

    expect(response.statusCode).toBe(201);
    expect(response.body.receipt).toMatchObject({
      project_id: 'mackland-altura',
      project: 'Mackland homeowner',
      amount: 284.76,
    });
    expect(response.body.state.receipts).toContainEqual(response.body.receipt);
    const saved = await store.loadCommandCenter();
    expect(saved.receipts[0]).toMatchObject({ project_id: 'mackland-altura', project: 'Mackland homeowner' });
  });

  test.each(['missing-project', '', null])('unknown explicit receipt project %s is rejected without saving', async projectId => {
    const before = await store.loadCommandCenter();
    const response = await parseReceipt({ project_id: projectId, project: 'Amherst homeowner' });

    expect(response.statusCode).toBe(404);
    expect(await store.loadCommandCenter()).toEqual(before);
  });

  test('name-only legacy receipts retain their project label', async () => {
    const response = await parseReceipt({ project: 'Legacy job label' });

    expect(response.statusCode).toBe(201);
    expect(response.body.receipt.project).toBe('Legacy job label');
    expect(response.body.receipt).not.toHaveProperty('project_id');
    expect((await store.loadCommandCenter()).receipts[0].project).toBe('Legacy job label');
  });

  function deferOcrProvider() {
    let release;
    let signalStarted;
    const started = new Promise(resolve => { signalStarted = resolve; });
    ocrProvider.mockImplementationOnce(() => {
      signalStarted();
      return new Promise(resolve => { release = resolve; });
    });
    return {
      started,
      finish: () => release({
        vendor: 'Scanned supplier',
        total: 284.76,
        category: 'Materials',
        confidence: 'review',
        date: '2026-08-03',
      }),
    };
  }

  test('receipt processing retains receipt and activity edits made while the provider is pending', async () => {
    const provider = deferOcrProvider();
    const pending = parseReceipt({ project_id: 'mackland-altura' });
    await provider.started;
    const current = await store.loadCommandCenter();
    const concurrentReceipt = { id: 'manual-receipt', vendor: 'Local supplier', amount: 50 };
    const concurrentActivity = { id: 'manual-activity', type: 'Builder note', detail: 'Delivery confirmed.' };
    await store.saveCommandCenter({
      receipts: [concurrentReceipt, ...current.receipts],
      activity: [concurrentActivity, ...current.activity],
      projects: current.projects.map(project => project.id === 'mackland-altura'
        ? { ...project, client: 'Updated Mackland client' }
        : project),
    });
    provider.finish();
    const response = await pending;

    expect(response.statusCode).toBe(201);
    expect(response.body.state.receipts).toContainEqual(concurrentReceipt);
    expect(response.body.state.activity).toContainEqual(concurrentActivity);
    expect(response.body.receipt.project).toBe('Updated Mackland client');
    const saved = await store.loadCommandCenter();
    expect(saved.receipts).toContainEqual(concurrentReceipt);
    expect(saved.activity).toContainEqual(concurrentActivity);
    expect(saved.receipts[0].vendor).toBe('Scanned supplier');
  });

  test('receipt processing rejects a project removed while the provider is pending', async () => {
    const provider = deferOcrProvider();
    const pending = parseReceipt({ project_id: 'mackland-altura' });
    await provider.started;
    const current = await store.loadCommandCenter();
    const afterRemoval = await store.saveCommandCenter({
      projects: current.projects.filter(project => project.id !== 'mackland-altura'),
    });
    provider.finish();
    const response = await pending;

    expect(response.statusCode).toBe(404);
    expect(await store.loadCommandCenter()).toEqual(afterRemoval);
  });
});
