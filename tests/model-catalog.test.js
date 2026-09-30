const test = require('node:test');
const assert = require('node:assert/strict');
const publicCatalog = require('../data/model-catalog.json');
const { MODEL_CATALOG } = require('../platform/server/src/services/modelCatalog');

test('public model metadata matches the six active builder variants', () => {
  assert.equal(publicCatalog.builderReadyModels.length, 6);
  for (const model of MODEL_CATALOG) {
    const entry = publicCatalog.builderReadyModels.find(row => row.modelId === model.id);
    assert.ok(entry, `Missing public metadata for ${model.id}`);
    assert.equal(entry.name, model.name);
    assert.equal(entry.squareFeet, model.sqft);
    assert.equal(entry.bedrooms, model.bedrooms);
    assert.equal(entry.bathrooms, model.bathrooms);
    assert.equal(entry.type, model.type);
  }
  assert.equal(publicCatalog.builderReadyModels.find(row => row.modelId === 'netherwood-440').id, 'hyder-hut');
  assert.equal(publicCatalog.builderReadyModels.find(row => row.modelId === 'altura-576').id, 'altura-24x24');
});

test('retired and unconfirmed models are not republished as current model choices', () => {
  for (const key of ['builderReadyModels', 'abqaduSourceModels']) {
    assert.doesNotMatch(JSON.stringify(publicCatalog[key]), /Tierra Grande|Casita Portal|Bryn Mawr|Burton|Townhouse|Flex Barn/i);
  }
  assert.deepEqual(publicCatalog.cityPlanVariations.map(row => row.squareFeet), [450, 550, 650, 750]);
});
