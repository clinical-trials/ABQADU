const router = require('express').Router();
const { fetchWttrForecast } = require('../services/weatherIntelligence');
const { loadCommandCenter, saveCommandCenter } = require('../services/commandCenterStore');
const { createCrewMessagesFromForecast } = require('../services/crewMessageEngine');

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
    const projects = Array.isArray(state.projects) ? state.projects : [];
    const requestedProject = req.body?.project;
    const hasProjectId = Object.prototype.hasOwnProperty.call(req.body || {}, 'project_id');
    const legacyProjectKey = typeof requestedProject === 'string'
      ? requestedProject
      : requestedProject?.id || requestedProject?.client;
    const projectRecord = hasProjectId
      ? projects.find(project => project.id === req.body.project_id)
      : legacyProjectKey
        ? projects.find(project => project.id === legacyProjectKey || project.client === legacyProjectKey)
        : projects[0];
    if (!projectRecord) return res.status(404).json({ error: 'Project not found' });

    const forecast = req.body?.forecast || await fetchWttrForecast(req.body?.zip || '87106');
    const crewMessages = createCrewMessagesFromForecast(projectRecord, forecast);
    const check = {
      ...forecast,
      id: `weather-${Date.now()}`,
      project_id: projectRecord.id,
      project: projectRecord.client,
    };
    const activity = {
      id: `activity-${Date.now()}`,
      type: 'Weather delay',
      project_id: projectRecord.id,
      detail: `${projectRecord.client}: ${forecast.crew_message}`,
      at: new Date().toISOString(),
    };

    const saved = await saveCommandCenter({
      weather_checks: [check, ...(state.weather_checks || [])].slice(0, 20),
      crew_messages: [...crewMessages, ...(state.crew_messages || [])].slice(0, 40),
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
