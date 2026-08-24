const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, '..', 'src', 'index.js');
const routeFile = path.join(__dirname, '..', 'src', 'routes', 'weather.js');
const serviceFile = path.join(__dirname, '..', 'src', 'services', 'weatherIntelligence.js');

function assertIncludes(file, text) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes(text)) throw new Error(`${file} missing ${text}`);
}

const sampleWttr = {
  nearest_area: [{ areaName: [{ value: 'Albuquerque' }], region: [{ value: 'New Mexico' }] }],
  current_condition: [{
    temp_F: '87',
    windspeedMiles: '18',
    winddir16Point: 'SW',
    precipInches: '0.02',
    weatherDesc: [{ value: 'Patchy rain nearby' }],
  }],
  weather: [
    {
      date: '2026-08-03',
      maxtempF: '93',
      mintempF: '67',
      hourly: [
        { chanceofrain: '80', precipInches: '0.18', windspeedMiles: '32', WindGustMiles: '45', weatherDesc: [{ value: 'Thunderstorm' }] },
      ],
    },
    {
      date: '2026-08-04',
      maxtempF: '91',
      mintempF: '65',
      hourly: [
        { chanceofrain: '10', precipInches: '0.00', windspeedMiles: '14', WindGustMiles: '20', weatherDesc: [{ value: 'Sunny' }] },
      ],
    },
  ],
};

test('weather routes are registered', () => {
  assertIncludes(indexFile, "app.use('/api/weather'");
  assertIncludes(routeFile, "router.get('/forecast'");
  assertIncludes(routeFile, "router.post('/forecast/activity'");
  assertIncludes(serviceFile, 'normalizeWttrForecast');
});

test('wttr forecast is normalized into construction delay risk', () => {
  const { normalizeWttrForecast } = require('../src/services/weatherIntelligence');
  const forecast = normalizeWttrForecast(sampleWttr, '87106');

  expect(forecast.zip).toBe('87106');
  expect(forecast.location).toContain('Albuquerque');
  expect(forecast.risk_level).toBe('high');
  expect(forecast.delay_days).toBeGreaterThanOrEqual(7);
  expect(forecast.risks.map(r => r.type)).toContain('rain');
  expect(forecast.risks.map(r => r.type)).toContain('wind');
  expect(forecast.crew_message).toContain('Weather risk for 87106');
  expect(forecast.crew_message).toContain('roofing');
});

test('weather fetch uses wttr.in j1 endpoint', async () => {
  const { fetchWttrForecast } = require('../src/services/weatherIntelligence');
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    return { ok: true, json: async () => sampleWttr };
  };
  const forecast = await fetchWttrForecast('87501', fakeFetch);

  expect(calls[0]).toBe('https://wttr.in/87501?format=j1');
  expect(forecast.zip).toBe('87501');
});

test('weather risks create text-ready crew messages for Version 10 work categories', () => {
  const { createCrewMessagesFromForecast } = require('../src/services/crewMessageEngine');
  const messages = createCrewMessagesFromForecast(
    { id: 'amherst-altura', client: 'Amherst homeowner' },
    {
      risk_level: 'high',
      delay_days: 7,
      risks: [
        { type: 'rain', impacted_work: ['roofing', 'trenching', 'concrete'], delay_days: 7 },
        { type: 'wind', impacted_work: ['material delivery', 'inspection'], delay_days: 2 },
        { type: 'wildfire_smoke', impacted_work: ['crew productivity', 'exterior work'], delay_days: 1 },
      ],
      crew_message: 'Weather risk for 87106: HIGH risk.',
    }
  );

  expect(messages.map(message => message.trade)).toEqual([
    'roofing',
    'trenching',
    'concrete',
    'delivery',
    'inspections',
    'productivity',
    'wildfire/air quality',
  ]);
  expect(messages[0]).toEqual(expect.objectContaining({
    project_id: 'amherst-altura',
    trade: 'roofing',
    reason: 'Weather risk',
    status: 'Draft',
  }));
  expect(messages[0].body).toContain('Amherst homeowner');
  expect(messages[0].body).toContain('roofing crew');
  expect(messages[4].body).toContain('inspection slot');
  expect(messages[6].body).toContain('air quality');
});

test('weather activity stores crew message drafts with weather checks', async () => {
  const fs = require('fs');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abqadu-weather-crew-'));
  process.env.COMMAND_CENTER_STORE_PATH = path.join(tmp, 'store.json');
  jest.resetModules();

  const store = require('../src/services/commandCenterStore');
  const weatherRoute = require('../src/routes/weather');
  await store.resetCommandCenter();
  const activityLayer = weatherRoute.stack.find(layer => layer.route?.path === '/forecast/activity');
  const handler = activityLayer.route.stack[0].handle;
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

  await handler(
    {
      body: {
        project: { id: 'amherst-altura', client: 'Amherst homeowner' },
        forecast: {
          risk_level: 'high',
          delay_days: 7,
          crew_message: 'Weather risk for 87106: HIGH risk.',
          risks: [
            { type: 'rain', impacted_work: ['trenching', 'concrete'], delay_days: 7 },
            { type: 'wind', impacted_work: ['material delivery'], delay_days: 2 },
          ],
        },
      },
    },
    response
  );
  const saved = response.body;

  expect(response.statusCode).toBe(201);
  expect(saved.crew_messages.map(message => message.trade)).toEqual(['trenching', 'concrete', 'delivery']);
  expect(saved.crew_messages[0].body).toContain('Amherst homeowner');
  expect(saved.crew_messages[0].status).toBe('Draft');
  expect(saved.weather_checks[0].project).toBe('Amherst homeowner');
});
