// A normalized handoff from the native RoomPlan companion. Imported source
// metadata is a file's claim, not proof of hardware or measurement accuracy.
const SCHEMA = 'abqadu.roomplan.v1';
const METRES_PER_FOOT = 0.3048;
const CONFIDENCE = ['high', 'medium', 'low', 'unknown'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = (value, max) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const validId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(value);
const squareFeet = metres => metres / (METRES_PER_FOOT ** 2);
const feet = metres => metres / METRES_PER_FOOT;
const nearestHundredth = value => Math.round((value + Number.EPSILON) * 100) / 100;
// Correct only floating-point noise at an exact hundredth before rounding up.
const roundUp = value => value <= 0 ? 0 : Math.max(0.01,
  Math.ceil(value * 100 - Number.EPSILON * Math.max(1, Math.abs(value * 100)) * 8) / 100);

export const DEMO_ROOM_SCAN = {
  schema: SCHEMA, scan_id: 'demo-room-001', captured_at: '2026-10-01T12:00:00Z',
  source: { kind: 'apple-roomplan', mode: 'fixture', app: 'ABQ ADU synthetic sample', version: '1.0' },
  units: 'm',
  rooms: [{
    id: 'demo-living-room', name: 'Sample living room',
    walls: [
      { id: 'demo-wall-1', length_m: 4, height_m: 2.4, confidence: 'high' },
      { id: 'demo-wall-2', length_m: 3, height_m: 2.4, confidence: 'high' },
      { id: 'demo-wall-3', length_m: 4, height_m: 2.4, confidence: 'high' },
      { id: 'demo-wall-4', length_m: 3, height_m: 2.4, confidence: 'high' },
    ],
    openings: [
      { id: 'demo-door-1', wall_id: 'demo-wall-1', kind: 'door', width_m: 0.9, height_m: 2.1, reaches_floor: true, confidence: 'high' },
      { id: 'demo-window-1', wall_id: 'demo-wall-3', kind: 'window', width_m: 1.2, height_m: 1.2, reaches_floor: false, confidence: 'high' },
    ],
    floor: { area_m2: 12, method: 'captured-polygon' },
  }],
};

function validTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function invalid(errors) {
  return { ready: false, scanId: null, capturedAt: null, source: null, rooms: [], items: [], warnings: [], errors };
}

export function parseRoomScan(raw) {
  let input = raw;
  if (typeof raw === 'string') {
    try { input = JSON.parse(raw); } catch { return invalid(['The scan file is not valid JSON.']); }
  }
  if (!record(input)) return invalid(['The scan must be a RoomPlan export object.']);
  const errors = [];
  if (input.schema !== SCHEMA) errors.push('Unsupported scan schema. Export an abqadu.roomplan.v1 file.');
  if (input.units !== 'm') errors.push('Scan dimensions must use metres (units: m).');
  if (!validId(input.scan_id)) errors.push('Scan ID must be a nonempty identifier of at most 80 characters.');
  if (!validTimestamp(input.captured_at)) errors.push('Scan capture time must be a valid ISO 8601 timestamp.');
  if (!record(input.source) || input.source.kind !== 'apple-roomplan'
    || !['device', 'fixture'].includes(input.source.mode)
    || !text(input.source.app, 80) || !text(input.source.version, 40)) {
    errors.push('Source must identify the RoomPlan app, version, and device or fixture mode.');
  }
  if (!Array.isArray(input.rooms) || input.rooms.length < 1 || input.rooms.length > 24) {
    errors.push('Import between 1 and 24 rooms at a time.');
  }
  if (errors.length) return invalid(errors);

  const ids = new Set([input.scan_id]);
  let surfaceCount = 0;
  function checkId(value, label) {
    if (!validId(value)) errors.push(`${label} needs a valid identifier of at most 80 characters.`);
    else if (ids.has(value)) errors.push(`Duplicate identifier: ${value}. Each room and surface must have its own ID.`);
    else ids.add(value);
  }
  function confidence(value, label) {
    if (value !== undefined && !CONFIDENCE.includes(value)) errors.push(`${label} has an invalid confidence value.`);
    return value || 'unknown';
  }
  const normalized = [];
  for (const room of input.rooms) {
    if (!record(room)) { errors.push('Every room must be an object.'); continue; }
    checkId(room.id, 'Room');
    if (!text(room.name, 120)) errors.push('Room names must contain 1 to 120 characters.');
    if (!Array.isArray(room.walls) || !room.walls.length || room.walls.length > 200
      || !Array.isArray(room.openings) || room.openings.length > 400) {
      errors.push('Each room needs 1 to 200 walls and no more than 400 openings.');
      continue;
    }
    surfaceCount += room.walls.length + room.openings.length;
    if (surfaceCount > 3000) { errors.push('Import no more than 3,000 surfaces at a time.'); break; }
    const walls = [];
    const openings = [];
    for (const wall of room.walls) {
      if (!record(wall)) { errors.push('Every wall must be an object.'); continue; }
      checkId(wall.id, 'Wall');
      if (!positive(wall.length_m, 100) || !positive(wall.height_m, 100)) errors.push('Wall length and height must be positive numeric metres, no more than 100 each.');
      walls.push({ id: wall.id, length_m: wall.length_m, height_m: wall.height_m, confidence: confidence(wall.confidence, 'Wall') });
    }
    const roomWalls = new Map(walls.map(wall => [wall.id, wall]));
    for (const opening of room.openings) {
      if (!record(opening)) { errors.push('Every opening must be an object.'); continue; }
      checkId(opening.id, 'Opening');
      if (!['door', 'window', 'opening'].includes(opening.kind)) errors.push('Opening kind must be door, window, or opening.');
      if (!positive(opening.width_m, 100) || !positive(opening.height_m, 100)) errors.push('Opening width and height must be positive numeric metres, no more than 100 each.');
      if (opening.reaches_floor !== null && typeof opening.reaches_floor !== 'boolean') errors.push('Opening floor contact must be true, false, or null when unknown.');
      if (opening.wall_id !== null && (!validId(opening.wall_id) || !roomWalls.has(opening.wall_id))) errors.push('Every linked opening must reference an existing wall in the same room. Use null for an unlinked opening.');
      const parent = roomWalls.get(opening.wall_id);
      if (parent && positive(parent.length_m, 100) && positive(parent.height_m, 100)
        && positive(opening.width_m, 100) && positive(opening.height_m, 100)
        && (opening.width_m > parent.length_m + 1e-8 || opening.height_m > parent.height_m + 1e-8)) {
        errors.push('An opening cannot be wider or taller than its parent wall.');
      }
      openings.push({ id: opening.id, wall_id: opening.wall_id, kind: opening.kind, width_m: opening.width_m,
        height_m: opening.height_m, reaches_floor: opening.reaches_floor, confidence: confidence(opening.confidence, 'Opening') });
    }
    let floor = null;
    if (room.floor != null) {
      if (!record(room.floor) || !positive(room.floor.area_m2, 10000) || room.floor.method !== 'captured-polygon') {
        errors.push('Floor area must be a positive numeric captured-polygon area of no more than 10,000 square metres; bounding-box estimates are not accepted.');
      } else floor = { area_m2: room.floor.area_m2, method: 'captured-polygon' };
    }
    normalized.push({ id: room.id, name: room.name, walls, openings, floor });
  }
  if (errors.length) return invalid(errors);

  const warnings = [
    input.source.mode === 'fixture'
      ? 'DEMO FIXTURE: these synthetic sample measurements are not a property scan.'
      : 'Source information comes from the imported file. Device capture and measurement accuracy are not independently verified; review measurements on site.',
    'Wall quantities use rectangular captured surfaces and linked openings. Review missing surfaces, overlapping openings, and sloped or curved walls.',
    'Ceiling area is not measured by this handoff. Measure and enter it separately; floor area is never assumed to be ceiling area.',
    'Displayed dimensions are rounded to the nearest hundredth; quantities and deductions are rounded up. Room totals use the original metric measurements, so rounded detail rows may not add to the displayed totals.',
  ];
  const rooms = [];
  const items = [];
  for (const room of normalized) {
    let grossArea = 0;
    let netArea = 0;
    let baseboardLength = 0;
    let openingDeduction = 0;
    let baseboardDeduction = 0;
    const wallDetails = [];
    for (const wall of room.walls) {
      const children = room.openings.filter(opening => opening.wall_id === wall.id);
      const gross = wall.length_m * wall.height_m;
      const deduction = children.reduce((sum, opening) => sum + opening.width_m * opening.height_m, 0);
      const floorDeduction = children.filter(opening => opening.kind !== 'window' && opening.reaches_floor === true)
        .reduce((sum, opening) => sum + opening.width_m, 0);
      if (deduction > gross + 1e-8) errors.push(`${room.name}: combined opening area exceeds its parent wall area.`);
      if (floorDeduction > wall.length_m + 1e-8) errors.push(`${room.name}: combined floor openings exceed their parent wall length.`);
      grossArea += gross;
      netArea += Math.max(0, gross - deduction);
      baseboardLength += Math.max(0, wall.length_m - floorDeduction);
      openingDeduction += deduction;
      baseboardDeduction += floorDeduction;
      wallDetails.push({
        id: wall.id, label: `Wall ${wallDetails.length + 1}`,
        lengthFt: nearestHundredth(feet(wall.length_m)), heightFt: nearestHundredth(feet(wall.height_m)),
        grossAreaSqFt: roundUp(squareFeet(gross)), openingDeductionSqFt: roundUp(squareFeet(deduction)),
        netAreaSqFt: roundUp(squareFeet(Math.max(0, gross - deduction))),
        baseboardLengthFt: roundUp(feet(Math.max(0, wall.length_m - floorDeduction))),
        baseboardDeductionFt: roundUp(feet(floorDeduction)), confidence: wall.confidence,
      });
    }
    const wallLabels = new Map(wallDetails.map(wall => [wall.id, wall.label]));
    const openingCounts = { door: 0, window: 0, opening: 0 };
    const openingLabels = { door: 'Door', window: 'Window', opening: 'Opening' };
    const openingDetails = room.openings.map(opening => {
      const area = opening.width_m * opening.height_m;
      const linked = opening.wall_id !== null;
      const floorDeduction = linked && opening.kind !== 'window' && opening.reaches_floor === true ? opening.width_m : 0;
      openingCounts[opening.kind] += 1;
      return {
        id: opening.id, label: `${openingLabels[opening.kind]} ${openingCounts[opening.kind]}`,
        wallId: opening.wall_id, wallLabel: linked ? wallLabels.get(opening.wall_id) : null, kind: opening.kind,
        widthFt: nearestHundredth(feet(opening.width_m)), heightFt: nearestHundredth(feet(opening.height_m)),
        areaSqFt: roundUp(squareFeet(area)), wallDeductionSqFt: linked ? roundUp(squareFeet(area)) : 0,
        baseboardDeductionFt: roundUp(feet(floorDeduction)), reachesFloor: opening.reaches_floor, confidence: opening.confidence,
      };
    });
    const unlinkedOpeningCount = room.openings.filter(opening => opening.wall_id === null).length;
    const unknownFloorCount = room.openings.filter(opening => opening.wall_id !== null && opening.kind !== 'window' && opening.reaches_floor === null).length;
    if (unlinkedOpeningCount) warnings.push(`${room.name}: ${unlinkedOpeningCount} unlinked opening(s) were not deducted from wall area or baseboards. Review them manually.`);
    if (unknownFloorCount) warnings.push(`${room.name}: ${unknownFloorCount} opening(s) have unknown floor contact. No baseboard deduction was assumed for those openings.`);
    for (const level of ['low', 'medium', 'unknown']) {
      const count = [...room.walls, ...room.openings].filter(surface => surface.confidence === level).length;
      if (count) warnings.push(`${room.name}: ${count} surface(s) have ${level} confidence. Verify dimensions before pricing.`);
    }
    if (!room.floor) warnings.push(`${room.name}: floor area was not captured. Measure it separately; wall dimensions do not establish floor area.`);
    const summary = {
      id: room.id, name: room.name, grossWallAreaSqFt: roundUp(squareFeet(grossArea)),
      netWallAreaSqFt: roundUp(squareFeet(netArea)), floorAreaSqFt: room.floor ? roundUp(squareFeet(room.floor.area_m2)) : null,
      baseboardLengthFt: roundUp(feet(baseboardLength)), wallCount: room.walls.length,
      openingCount: room.openings.length, unlinkedOpeningCount,
      openingDeductionSqFt: roundUp(squareFeet(openingDeduction)), baseboardDeductionFt: roundUp(feet(baseboardDeduction)),
      walls: wallDetails, openings: openingDetails,
    };
    rooms.push(summary);
    const provenance = `RoomPlan ${input.source.mode === 'fixture' ? 'DEMO FIXTURE' : 'device file'}; scan ${input.scan_id}; room ${room.id}`;
    const rows = [
      ['walls', 'Wall paint (scan baseline)', summary.netWallAreaSqFt, 'sq ft'],
      ['floor', 'Floor installation (scan baseline)', summary.floorAreaSqFt, 'sq ft'],
      ['ceiling', 'Ceiling finish (not measured)', null, 'sq ft'],
      ['baseboard', 'Baseboard (scan baseline)', summary.baseboardLengthFt, 'linear ft'],
    ];
    for (const [kind, label, quantity, unit] of rows) {
      if (quantity !== null && quantity > 1000000) errors.push(`${room.name}: ${label} exceeds the estimator quantity limit. Split the room into smaller measured sections.`);
      items.push({ key: `${input.scan_id}:${room.id}:${kind}`, kind, roomId: room.id, roomName: room.name,
        category: 'Labor', description: `${label} · ${room.name.slice(0, 32)} · ${provenance}`,
        qty: quantity > 0 ? String(quantity) : '', unit, unit_cost: '' });
    }
  }
  if (errors.length) return invalid(errors);
  return {
    ready: true, scanId: input.scan_id, capturedAt: input.captured_at,
    source: { kind: input.source.kind, mode: input.source.mode, app: input.source.app, version: input.source.version },
    rooms, items, warnings, errors: [],
  };
}
