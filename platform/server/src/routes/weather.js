const router = require('../asyncRouter')();
const { randomUUID } = require('crypto');
const { fetchForecast } = require('../services/weatherProvider');
const { loadCommandCenter, saveCommandCenter } = require('../services/commandCenterStore');
const { createCrewMessagesFromForecast } = require('../services/crewMessageEngine');

router.get('/forecast', async (req, res) => {
  try {
    const forecast = await fetchForecast(req.query.zip || '87106');
    res.json(forecast);
  } catch (error) {
    res.status(error.status || 502).json({
      error: error.message || 'Weather forecast unavailable',
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

    // Logging always obtains server-verified provider data. Browser-supplied
    // figures, risk labels and attribution must never become a provider record.
    const forecast = await fetchForecast(req.body?.zip || req.body?.forecast?.zip || '87106');
    const saved = await saveCommandCenter(current => {
      const latestProject = current.projects?.find(project => project.id === projectRecord.id);
      if (!latestProject) throw Object.assign(new Error('Project not found'), { status: 404 });
      const crewMessages = createCrewMessagesFromForecast(latestProject, forecast)
        .map(message => ({ ...message, id: `crew-${randomUUID()}` }));
      const check = {
        ...forecast,
        id: `weather-${randomUUID()}`,
        project_id: latestProject.id,
        project: latestProject.client,
      };
      const activity = {
        id: `activity-${randomUUID()}`,
        type: 'Weather delay',
        project_id: latestProject.id,
        detail: `${latestProject.client}: ${forecast.crew_message}`,
        at: new Date().toISOString(),
      };
      return {
        weather_checks: [check, ...(current.weather_checks || [])].slice(0, 20),
        crew_messages: [...crewMessages, ...(current.crew_messages || [])].slice(0, 40),
        activity: [activity, ...(current.activity || [])].slice(0, 40),
      };
    });
    res.status(201).json(saved);
  } catch (error) {
    res.status(error.status || 502).json({
      error: error.message || 'Weather risk could not be logged',
    });
  }
});

module.exports = router;
