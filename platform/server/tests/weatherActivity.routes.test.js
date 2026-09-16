const fs = require('fs');
const os = require('os');
const path = require('path');

describe('weather activity project attribution', () => {
  let handler;
  let store;
  let directory;
  let originalStorePath;

  const forecast = {
    zip: '87106',
    risk_level: 'high',
    delay_days: 2,
    crew_message: 'Rain can delay roofing.',
    risks: [{ type: 'rain', impacted_work: ['roofing'], delay_days: 2 }],
  };

  beforeEach(async () => {
    originalStorePath = process.env.COMMAND_CENTER_STORE_PATH;
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abqadu-weather-project-'));
    process.env.COMMAND_CENTER_STORE_PATH = path.join(directory, 'store.json');
    jest.resetModules();
    store = require('../src/services/commandCenterStore');
    await store.resetCommandCenter();
    const router = require('../src/routes/weather');
    handler = router.stack.find(layer => layer.route?.path === '/forecast/activity').route.stack[0].handle;
  });

  afterEach(() => {
    if (originalStorePath === undefined) delete process.env.COMMAND_CENTER_STORE_PATH;
    else process.env.COMMAND_CENTER_STORE_PATH = originalStorePath;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function postWeather(body) {
    const response = {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    await handler({ body }, response);
    return { status: response.statusCode || 200, body: response.body };
  }

  test('explicit project id attributes checks, activity, and crews to the selected project', async () => {
    const response = await postWeather({
      project_id: 'mackland-altura',
      project: 'Amherst homeowner',
      forecast,
    });

    expect(response.status).toBe(201);
    expect(response.body.weather_checks[0]).toMatchObject({
      project_id: 'mackland-altura',
      project: 'Mackland homeowner',
    });
    expect(response.body.activity[0]).toMatchObject({
      project_id: 'mackland-altura',
      detail: 'Mackland homeowner: Rain can delay roofing.',
    });
    expect(response.body.crew_messages[0].project_id).toBe('mackland-altura');
    expect(response.body.crew_messages[0].body).toContain('Mackland homeowner');
    const saved = await store.loadCommandCenter();
    expect(saved.weather_checks[0].project_id).toBe('mackland-altura');
  });

  test('forecast data cannot replace the saved project identity or check id', async () => {
    const response = await postWeather({
      project_id: 'mackland-altura',
      forecast: {
        ...forecast,
        id: 'spoofed-check',
        project_id: 'amherst-altura',
        project: 'Different homeowner',
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.weather_checks[0]).toMatchObject({
      project_id: 'mackland-altura',
      project: 'Mackland homeowner',
    });
    expect(response.body.weather_checks[0].id).toMatch(/^weather-/);
  });

  test.each(['missing-project', '', null])('unknown explicit project id %s is rejected without saving', async projectId => {
    const before = await store.loadCommandCenter();
    const response = await postWeather({
      project_id: projectId,
      project: 'Amherst homeowner',
      forecast,
    });

    expect(response.status).toBe(404);
    expect(await store.loadCommandCenter()).toEqual(before);
  });

  test('legacy project names still resolve to their saved project', async () => {
    const response = await postWeather({
      project: 'Mackland homeowner',
      forecast,
    });

    expect(response.status).toBe(201);
    expect(response.body.weather_checks[0]).toMatchObject({
      project_id: 'mackland-altura',
      project: 'Mackland homeowner',
    });
  });

  test('legacy project objects use the saved client name', async () => {
    const response = await postWeather({
      project: { id: 'mackland-altura', client: 'Unsaved client name' },
      forecast,
    });

    expect(response.status).toBe(201);
    expect(response.body.weather_checks[0].project).toBe('Mackland homeowner');
    expect(response.body.crew_messages[0].body).toContain('Mackland homeowner');
  });
});
