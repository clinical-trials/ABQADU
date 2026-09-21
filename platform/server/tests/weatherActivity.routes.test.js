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
    jest.doMock('../src/services/weatherKit', () => ({ fetchWeatherKitForecast: jest.fn(async () => ({...forecast, provider:'weatherkit', source:'Apple Weather', attribution:{legal_url:'https://developer.apple.com/weatherkit/data-source-attribution/'}})) }));
    store = require('../src/services/commandCenterStore');
    await store.resetCommandCenter();
    const router = require('../src/routes/weather');
    handler = router.stack.find(layer => layer.route?.path === '/forecast/activity').route.stack[0].handle;
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
  }

  test('an edit made while Apple weather is loading survives the weather append', async () => {
    const started = deferred();
    const release = deferred();
    require('../src/services/weatherKit').fetchWeatherKitForecast.mockImplementationOnce(() => {
      started.resolve();
      return release.promise;
    });
    const pending = postWeather({ project_id: 'mackland-altura', zip: '87106' });
    await started.promise;
    const current = await store.loadCommandCenter();
    await store.saveCommandCenter({
      activity: [{ id: 'concurrent-site-edit', detail: 'Site visit completed.' }, ...current.activity],
      projects: current.projects.map(project => project.id === 'mackland-altura'
        ? { ...project, client: 'Updated homeowner' } : project),
    });
    release.resolve(forecast);
    const response = await pending;

    expect(response.status).toBe(201);
    const saved = await store.loadCommandCenter();
    expect(saved.activity.some(item => item.id === 'concurrent-site-edit')).toBe(true);
    expect(saved.weather_checks[0].project).toBe('Updated homeowner');
    expect(saved.crew_messages[0].body).toContain('Updated homeowner');
  });

  test('two overlapping weather logs both remain in the saved history', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    const started = deferred();
    const release = deferred();
    let arrivals = 0;
    require('../src/services/weatherKit').fetchWeatherKitForecast.mockImplementation(() => {
      if (++arrivals === 2) started.resolve();
      return release.promise;
    });
    const first = postWeather({ project_id: 'mackland-altura', zip: '87106' });
    const second = postWeather({ project_id: 'mackland-altura', zip: '87106' });
    await started.promise;
    release.resolve(forecast);
    const responses = await Promise.all([first, second]);

    expect(responses.map(response => response.status)).toEqual([201, 201]);
    const saved = await store.loadCommandCenter();
    const checks = saved.weather_checks.filter(check => check.project_id);
    expect(checks.map(check => check.project_id)).toEqual(['mackland-altura', 'mackland-altura']);
    expect(new Set(checks.map(check => check.id)).size).toBe(2);
    expect(saved.crew_messages.map(message => message.project_id)).toEqual(['mackland-altura', 'mackland-altura']);
    expect(new Set(saved.crew_messages.map(message => message.id)).size).toBe(2);
  });

  test('deleting a project during its weather request prevents an orphaned log', async () => {
    const started = deferred();
    const release = deferred();
    require('../src/services/weatherKit').fetchWeatherKitForecast.mockImplementationOnce(() => {
      started.resolve();
      return release.promise;
    });
    const pending = postWeather({ project_id: 'mackland-altura', zip: '87106' });
    await started.promise;
    const current = await store.loadCommandCenter();
    const afterDeletion = await store.saveCommandCenter({
      projects: current.projects.filter(project => project.id !== 'mackland-altura'),
    });
    release.resolve(forecast);
    const response = await pending;

    expect(response.status).toBe(404);
    expect(await store.loadCommandCenter()).toEqual(afterDeletion);
  });

  test('an asynchronous updater and an existing object save preserve both changes', async () => {
    const append = store.saveCommandCenter(async current => {
      await new Promise(resolve => setImmediate(resolve));
      return { activity: [{ id: 'async-append' }, ...current.activity] };
    });
    const edit = store.saveCommandCenter({ builder: { company: 'Updated builder' } });
    await Promise.all([append, edit]);

    const saved = await store.loadCommandCenter();
    expect(saved.activity[0].id).toBe('async-append');
    expect(saved.builder.company).toBe('Updated builder');
  });

  test('a rejected updater leaves the saved record intact and allows the next save', async () => {
    const before = await store.loadCommandCenter();
    await expect(store.saveCommandCenter(async () => {
      throw new Error('Update cancelled');
    })).rejects.toThrow('Update cancelled');
    expect(await store.loadCommandCenter()).toEqual(before);

    await store.saveCommandCenter({ builder: { company: 'Next edit' } });
    expect((await store.loadCommandCenter()).builder.company).toBe('Next edit');
  });

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

  test('logging uses a server forecast and ignores browser-supplied risks and attribution', async () => {
    const response = await postWeather({project_id:'mackland-altura', zip:'87108', forecast:{...forecast, crew_message:'Invented weather', risk_level:'low', source:'Forged provider', attribution:{legal_url:'https://evil.example'}}});
    expect(require('../src/services/weatherKit').fetchWeatherKitForecast).toHaveBeenCalledWith('87108');
    expect(response.status).toBe(201);
    expect(response.body.weather_checks[0]).toMatchObject({source:'Apple Weather', provider:'weatherkit', crew_message:forecast.crew_message});
    expect(response.body.weather_checks[0].attribution.legal_url).toBe('https://developer.apple.com/weatherkit/data-source-attribution/');
  });

  test('a failed Apple forecast cannot create a weather log or crew drafts', async () => {
    const before = await store.loadCommandCenter();
    require('../src/services/weatherKit').fetchWeatherKitForecast.mockRejectedValueOnce(Object.assign(new Error('Configure WeatherKit before checking weather.'), {status:503}));
    const response = await postWeather({project_id:'mackland-altura', zip:'87106', forecast});
    expect(response.status).toBe(503);
    expect(await store.loadCommandCenter()).toEqual(before);
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
