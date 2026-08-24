const MODEL_CATALOG = [
  {
    id: 'netherwood-440',
    name: 'Netherwood 440',
    family: 'Netherwood',
    sqft: 440,
    bedrooms: 1,
    bathrooms: 1,
    type: 'ADU',
    base_price: 125400,
    default_cogs_low: 66000,
    default_cogs_high: 74800,
    aliases: ['Netherwood House', 'Netherwood 1BR', 'Bryn Mawr'],
  },
  {
    id: 'netherwood-550',
    name: 'Netherwood 550',
    family: 'Netherwood',
    sqft: 550,
    bedrooms: 2,
    bathrooms: 1,
    type: 'ADU',
    base_price: 156750,
    default_cogs_low: 82500,
    default_cogs_high: 93500,
    aliases: ['Netherwood 2BR', 'Netherwood two bedroom'],
  },
  {
    id: 'altura-576',
    name: 'Altura 576',
    family: 'Altura',
    sqft: 576,
    bedrooms: 1,
    bathrooms: 1,
    type: 'ADU',
    base_price: 164160,
    default_cogs_low: 86400,
    default_cogs_high: 97920,
    aliases: ['Altura', 'Altura 1BR'],
  },
  {
    id: 'altura-650',
    name: 'Altura 650',
    family: 'Altura',
    sqft: 650,
    bedrooms: 2,
    bathrooms: 1,
    type: 'ADU',
    base_price: 185250,
    default_cogs_low: 97500,
    default_cogs_high: 110500,
    aliases: ['Altura 2BR', 'Altura two bedroom'],
  },
  {
    id: 'cromwell-1280',
    name: 'Cromwell 1280',
    family: 'Cromwell',
    sqft: 1280,
    bedrooms: 2,
    bathrooms: 1.5,
    type: 'Single Family',
    base_price: 364800,
    default_cogs_low: 192000,
    default_cogs_high: 217600,
    aliases: ['The Cromwell', 'Cromwell'],
  },
  {
    id: 'series-750',
    name: '750 Series',
    family: '750 Series',
    sqft: 750,
    bedrooms: 2,
    bathrooms: 1,
    type: 'ADU',
    base_price: 213750,
    default_cogs_low: 112500,
    default_cogs_high: 127500,
    aliases: ['750 Series 2BR'],
  },
];

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function getModelById(modelId) {
  const found = MODEL_CATALOG.find(model => model.id === modelId);
  if (!found) throw new Error(`Unknown model id: ${modelId}`);
  return found;
}

function getModelByName(modelName) {
  const key = normalize(modelName);
  const found = MODEL_CATALOG.find(model =>
    normalize(model.name) === key ||
    normalize(model.family) === key ||
    (model.aliases || []).some(alias => normalize(alias) === key)
  );
  if (!found) throw new Error(`Unknown model name: ${modelName}`);
  return found;
}

function resolveModel(modelIdOrName) {
  return MODEL_CATALOG.find(model => model.id === modelIdOrName) || getModelByName(modelIdOrName);
}

function applyModelDefaults(project, modelIdOrName) {
  const model = resolveModel(modelIdOrName);
  return {
    ...project,
    model_id: model.id,
    model: model.name,
    sqft: model.sqft,
    bedrooms: model.bedrooms,
    bathrooms: model.bathrooms,
    bid_total: project.bid_total && project.bid_total > 1 ? project.bid_total : model.base_price,
    cogs_low: model.default_cogs_low,
    cogs_high: model.default_cogs_high,
  };
}

module.exports = {
  MODEL_CATALOG,
  getModelById,
  getModelByName,
  applyModelDefaults,
};
