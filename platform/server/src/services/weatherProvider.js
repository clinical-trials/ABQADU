const { fetchWeatherKitForecast, getWeatherKitStatus } = require('./weatherKit');
const { fetchNwsForecast, getNwsStatus } = require('./nwsWeather');

function providerName(env) {
  const provider = String(env.WEATHER_PROVIDER || 'nws').trim().toLowerCase();
  if (!['nws', 'weatherkit'].includes(provider)) {
    throw Object.assign(new Error('Set WEATHER_PROVIDER to nws or weatherkit on the server.'), { status: 503 });
  }
  return provider;
}

function getWeatherStatus(env = process.env) {
  let provider;
  try { provider = providerName(env); }
  catch { return { configured: false, provider: null, source: 'Weather', missing: ['WEATHER_PROVIDER'], required_env: ['WEATHER_PROVIDER'] }; }
  return provider === 'nws'
    ? { ...getNwsStatus(env), provider, source: 'National Weather Service' }
    : { ...getWeatherKitStatus(env), provider, source: 'Apple Weather' };
}

async function fetchForecast(zip, options = {}) {
  return providerName(options.env || process.env) === 'nws'
    ? fetchNwsForecast(zip, options)
    : fetchWeatherKitForecast(zip, options);
}

module.exports = { fetchForecast, getWeatherStatus };
