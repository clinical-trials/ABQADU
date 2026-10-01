import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Load the real web parser without changing the frontend's package settings or
// copying its validation/quantity logic into this native companion's tests.
const parserURL = new URL('../../../client/src/utils/roomScan.js', import.meta.url);
const source = await readFile(parserURL, 'utf8');
const { parseRoomScan } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
assert.ok(process.argv[2], 'Pass the temporary fixture directory created by ExportChecks.');

const results = {};
for (const name of ['baseline', 'unlinked', 'no-floor', 'unicode', 'limits']) {
  const json = await readFile(resolve(process.argv[2], `${name}.json`), 'utf8');
  const result = parseRoomScan(json);
  assert.equal(result.ready, true, `${name}: ${result.errors.join('; ')}`);
  assert.equal(result.source.mode, 'device');
  assert.equal(result.rooms.length, 1);
  assert.equal(result.items.length, 4);
  assert.ok(result.items.every(item => item.unit_cost === ''), `${name}: capture must not invent prices`);
  assert.equal(result.items.find(item => item.kind === 'ceiling').qty, '', `${name}: floor is not ceiling`);
  results[name] = result;
}

// Independent expected quantities: 14m perimeter × 2.4m high, less a
// 0.9×2.1m door and 1.2×1.2m window; 12m² floor. Quantities round up.
assert.equal(results.baseline.rooms[0].grossWallAreaSqFt, 361.67);
assert.equal(results.baseline.rooms[0].netWallAreaSqFt, 325.83);
assert.equal(results.baseline.rooms[0].floorAreaSqFt, 129.17);
assert.equal(results.baseline.rooms[0].baseboardLengthFt, 45.94);
assert.ok(results.baseline.warnings.some(warning => warning.includes('unknown floor contact')));
assert.equal(results.unlinked.rooms[0].unlinkedOpeningCount, 2);
assert.equal(results.unlinked.rooms[0].netWallAreaSqFt, 361.67);
assert.equal(results['no-floor'].rooms[0].floorAreaSqFt, null);
assert.equal(results['no-floor'].items.find(item => item.kind === 'floor').qty, '');
assert.equal(results.unicode.rooms[0].name, '🏠'.repeat(50));
assert.equal(results.limits.rooms[0].netWallAreaSqFt, 0);
console.log('5 actual Swift JSON exports accepted by the web importer; quantity and unknown-price checks passed.');
