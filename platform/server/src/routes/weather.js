const router = require('express').Router();
const { fetchWttrForecast } = require('../services/weatherIntelligence');
const { loadCommandCenter, saveCommandCenter } = require('../services/commandCenterStore');

router.get('/forecast', async (req, res) => {
  try {
    const forecast = await fetchWttrForecast(req.query.zip || '87106');
    res.json(forecast);
  } catch (error) {
    res.status(error.status || 502).json({
      error: 'Weather forecast unavailable',
      detail: error.message,
    });
  }
});

router.post('/forecast/activity', async (req, res) => {
  try {
    const state = await loadCommandCenter();
    const forecast = req.body?.forecast || await fetchWttrForecast(req.body?.zip || '87106');
    const project = req.body?.project || state.projects?.[0]?.client || 'Builder project';
    const check = {
      id: `weather-${Date.now()}`,
      project,
      ...forecast,
    };
    const activity = {
      id: `activity-${Date.now()}`,
      type: 'Weather delay',
      detail: `${project}: ${forecast.crew_message}`,
      at: new Date().toISOString(),
    };

    const saved = await saveCommandCenter({
      weather_checks: [check, ...(state.weather_checks || [])].slice(0, 20),
      activity: [activity, ...(state.activity || [])].slice(0, 40),
    });
    res.status(201).json(saved);
  } catch (error) {
    res.status(error.status || 502).json({
      error: 'Weather risk could not be logged',
      detail: error.message,
    });
  }
});

module.exports = router;
