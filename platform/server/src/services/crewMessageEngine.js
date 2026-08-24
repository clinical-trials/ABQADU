const CATEGORY_ALIASES = {
  rain: 'rain',
  monsoon: 'rain',
  wind: 'wind',
  wildfire: 'wildfire/air quality',
  wildfire_smoke: 'wildfire/air quality',
  smoke: 'wildfire/air quality',
  air_quality: 'wildfire/air quality',
  aqi: 'wildfire/air quality',
  roofing: 'roofing',
  roof: 'roofing',
  trenching: 'trenching',
  trench: 'trenching',
  'site work': 'trenching',
  concrete: 'concrete',
  'slab prep': 'concrete',
  delivery: 'delivery',
  'material delivery': 'delivery',
  'job-site delivery': 'delivery',
  inspection: 'inspections',
  inspections: 'inspections',
  permit: 'inspections',
  productivity: 'productivity',
  'crew productivity': 'productivity',
  heat: 'productivity',
};

const ACTIONS = {
  rain: 'hold exposed work, protect materials, and confirm the dry-window recovery plan before mobilizing.',
  wind: 'confirm lift, ladder, roof-edge, and loose-material safety before starting the shift.',
  'wildfire/air quality': 'check AQI before outdoor work, stage respirators if needed, and confirm the restart threshold.',
  roofing: 'confirm underlayment, dry-in, and roof-edge safety before opening roof work.',
  trenching: 'verify trench access, spoil placement, and pump-out needs before excavation.',
  concrete: 'protect subgrade and forms, then confirm pour timing, cure protection, and inspection readiness.',
  delivery: 'confirm truck access, covered staging, and supplier arrival windows before dispatch.',
  inspections: 'confirm the inspection slot and backup date before calling crews back to the site.',
  productivity: 'adjust shift timing, hydration/rest breaks, and manpower expectations for the forecast window.',
};

function slug(value) {
  return String(value || 'crew')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'crew';
}

function canonicalCategory(value) {
  const key = String(value || '').trim().toLowerCase();
  return CATEGORY_ALIASES[key] || null;
}

function projectName(project) {
  if (project?.client) return project.client;
  if (project?.name) return project.name;
  if (typeof project === 'string') return project;
  return 'Builder project';
}

function projectId(project) {
  if (project?.id) return project.id;
  return slug(projectName(project));
}

function categoriesForRisk(risk) {
  const categories = new Set();
  (risk.impacted_work || []).forEach(work => {
    const category = canonicalCategory(work);
    if (category) categories.add(category);
  });

  const riskCategory = canonicalCategory(risk.type);
  if (riskCategory && (categories.size === 0 || riskCategory === 'wildfire/air quality')) {
    categories.add(riskCategory);
  }

  return categories;
}

function createBody(project, forecast, category, risk) {
  const name = projectName(project);
  const base = forecast.crew_message || `Weather risk for ${name}: ${String(forecast.risk_level || 'unknown').toUpperCase()} risk.`;
  const delayDays = Number(risk?.delay_days || forecast.delay_days || 0);
  const delayText = delayDays > 0 ? ` Plan for up to ${delayDays} day(s) of schedule impact.` : '';
  const cause = risk?.type ? ` Trigger: ${String(risk.type).replace(/_/g, ' ')}.` : '';
  const crewLabel = category === 'inspections' ? 'inspection team' : `${category} crew`;
  return `${base} Project: ${name}. ${crewLabel} should ${ACTIONS[category] || 'confirm recovery plan and schedule impact.'}${delayText}${cause}`;
}

function createCrewMessagesFromForecast(project, forecast) {
  const risks = Array.isArray(forecast?.risks) ? forecast.risks : [];
  const categories = new Set();
  const categoryRisks = new Map();

  risks.forEach(risk => {
    categoriesForRisk(risk).forEach(category => {
      categories.add(category);
      if (!categoryRisks.has(category)) categoryRisks.set(category, risk);
    });
  });

  const createdAt = new Date().toISOString();
  return [...categories].map(category => ({
    id: `crew-${slug(projectId(project))}-${slug(category)}-${Date.now()}`,
    project_id: projectId(project),
    trade: category,
    reason: 'Weather risk',
    body: createBody(project, forecast || {}, category, categoryRisks.get(category)),
    status: 'Draft',
    created_at: createdAt,
  }));
}

module.exports = {
  createCrewMessagesFromForecast,
};
