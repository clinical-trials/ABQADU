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
