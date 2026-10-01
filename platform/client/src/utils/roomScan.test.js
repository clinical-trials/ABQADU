import { DEMO_ROOM_SCAN, parseRoomScan } from './roomScan';

function sample(changes = {}) {
  return {
    schema: 'abqadu.roomplan.v1', scan_id: 'scan-001', captured_at: '2026-10-02T14:30:00Z',
    source: { kind: 'apple-roomplan', mode: 'fixture', app: 'ABQ ADU Scan', version: '1.0' },
    units: 'm', rooms: [{
      id: 'room-001', name: 'Living room',
      walls: [{ id: 'wall-001', length_m: 3.048, height_m: 2.4384, confidence: 'high' }],
      openings: [
        { id: 'door-001', wall_id: 'wall-001', kind: 'door', width_m: 0.9144, height_m: 2.1336, reaches_floor: true, confidence: 'high' },
        { id: 'window-001', wall_id: 'wall-001', kind: 'window', width_m: 1.2192, height_m: 1.2192, reaches_floor: false, confidence: 'high' },
      ],
      floor: { area_m2: 9.290304, method: 'captured-polygon' },
    }],
    ...changes,
  };
}

test('real metric conversion preserves gross walls, net openings, floor, and baseboard quantities', () => {
  const result = parseRoomScan(sample());
  expect(result.ready).toBe(true);
  expect(result.rooms[0]).toMatchObject({ grossWallAreaSqFt: 80, netWallAreaSqFt: 43, floorAreaSqFt: 100, baseboardLengthFt: 7 });
  expect(result.items.map(item => [item.kind, item.qty, item.unit])).toEqual([
    ['walls', '43', 'sq ft'], ['floor', '100', 'sq ft'], ['ceiling', '', 'sq ft'], ['baseboard', '7', 'linear ft'],
  ]);
  expect(result.items.every(item => item.unit_cost === '')).toBe(true);
});

test('wall details explain the measured dimensions and deductions behind room quantities', () => {
  const room = parseRoomScan(sample()).rooms[0];
  expect(room).toMatchObject({ openingDeductionSqFt: 37, baseboardDeductionFt: 3 });
  expect(room.walls).toEqual([{
    id: 'wall-001', label: 'Wall 1', lengthFt: 10, heightFt: 8,
    grossAreaSqFt: 80, openingDeductionSqFt: 37, netAreaSqFt: 43,
    baseboardLengthFt: 7, baseboardDeductionFt: 3, confidence: 'high',
  }]);
  expect(room.openings).toEqual([
    { id: 'door-001', label: 'Door 1', wallId: 'wall-001', wallLabel: 'Wall 1', kind: 'door',
      widthFt: 3, heightFt: 7, areaSqFt: 21, wallDeductionSqFt: 21, baseboardDeductionFt: 3,
      reachesFloor: true, confidence: 'high' },
    { id: 'window-001', label: 'Window 1', wallId: 'wall-001', wallLabel: 'Wall 1', kind: 'window',
      widthFt: 4, heightFt: 4, areaSqFt: 16, wallDeductionSqFt: 16, baseboardDeductionFt: 0,
      reachesFloor: false, confidence: 'high' },
  ]);
});

test('details show an unlinked opening area while applying no wall or baseboard deduction', () => {
  const input = sample();
  input.rooms[0].openings[0].wall_id = null;
  const room = parseRoomScan(input).rooms[0];
  expect(room.openings[0]).toMatchObject({ wallId: null, wallLabel: null, areaSqFt: 21, wallDeductionSqFt: 0, baseboardDeductionFt: 0 });
  expect(room.walls[0]).toMatchObject({ openingDeductionSqFt: 16, netAreaSqFt: 64, baseboardDeductionFt: 0, baseboardLengthFt: 10 });
  expect(room).toMatchObject({ openingDeductionSqFt: 16, baseboardDeductionFt: 0 });
});

test('unknown floor contact and floor-height windows remain distinct in deduction details', () => {
  const input = sample();
  input.rooms[0].openings[0].reaches_floor = null;
  input.rooms[0].openings[1].reaches_floor = true;
  const room = parseRoomScan(input).rooms[0];
  expect(room.openings[0]).toMatchObject({ reachesFloor: null, wallDeductionSqFt: 21, baseboardDeductionFt: 0 });
  expect(room.openings[1]).toMatchObject({ kind: 'window', reachesFloor: true, wallDeductionSqFt: 16, baseboardDeductionFt: 0 });
  expect(room).toMatchObject({ openingDeductionSqFt: 37, baseboardDeductionFt: 0, baseboardLengthFt: 10 });
});

test('a generic floor opening receives the same applied deductions as a door', () => {
  const input = sample();
  input.rooms[0].openings[0].kind = 'opening';
  const room = parseRoomScan(input).rooms[0];
  expect(room.openings[0]).toMatchObject({ label: 'Opening 1', kind: 'opening', wallDeductionSqFt: 21, baseboardDeductionFt: 3, reachesFloor: true });
  expect(room).toMatchObject({ openingDeductionSqFt: 37, baseboardDeductionFt: 3, baseboardLengthFt: 7 });
});

test('detail confidence and parent labels preserve the correct surface across multiple walls', () => {
  const input = sample();
  input.rooms[0].walls.push({ id: 'wall-002', length_m: 3.048, height_m: 2.4384, confidence: 'medium' });
  input.rooms[0].walls[0].confidence = 'low';
  input.rooms[0].openings[0].wall_id = 'wall-002';
  delete input.rooms[0].openings[0].confidence;
  input.rooms[0].openings.push({ id: 'door-002', wall_id: 'wall-001', kind: 'door', width_m: 0.3048, height_m: 0.3048, reaches_floor: false, confidence: 'low' });
  const before = JSON.stringify(input);
  const result = parseRoomScan(input);
  expect(result.rooms[0].walls[0]).toMatchObject({ label: 'Wall 1', confidence: 'low', openingDeductionSqFt: 17 });
  expect(result.rooms[0].walls[1]).toMatchObject({ label: 'Wall 2', confidence: 'medium', openingDeductionSqFt: 21 });
  expect(result.rooms[0].openings[0]).toMatchObject({ label: 'Door 1', wallId: 'wall-002', wallLabel: 'Wall 2', confidence: 'unknown' });
  expect(result.rooms[0].openings[2]).toMatchObject({ label: 'Door 2', confidence: 'low' });
  expect(JSON.stringify(input)).toBe(before);
  expect(parseRoomScan(input)).toEqual(result);
});

test('room totals use unrounded metric measurements rather than displayed dimensions or detail sums', () => {
  const input = sample();
  input.rooms[0].walls = [
    { id: 'wall-001', length_m: 1, height_m: 1 },
    { id: 'wall-002', length_m: 1, height_m: 1 },
  ];
  input.rooms[0].openings = [];
  const result = parseRoomScan(input);
  expect(result.rooms[0].walls[0]).toMatchObject({ lengthFt: 3.28, heightFt: 3.28, grossAreaSqFt: 10.77, netAreaSqFt: 10.77, baseboardLengthFt: 3.29 });
  expect(result.rooms[0]).toMatchObject({ grossWallAreaSqFt: 21.53, netWallAreaSqFt: 21.53, baseboardLengthFt: 6.57 });
  expect(result.items.find(item => item.kind === 'walls').qty).toBe('21.53');
  expect(result.warnings.join(' ')).toMatch(/rounding|rounded/i);
});

test('combined wall and room deductions retain precision beyond rounded opening details', () => {
  const input = sample();
  input.rooms[0].walls = [{ id: 'wall-001', length_m: 1, height_m: 1 }];
  input.rooms[0].openings = [
    { id: 'opening-001', wall_id: 'wall-001', kind: 'opening', width_m: 0.102, height_m: 0.102, reaches_floor: true },
    { id: 'opening-002', wall_id: 'wall-001', kind: 'opening', width_m: 0.102, height_m: 0.102, reaches_floor: true },
  ];
  const room = parseRoomScan(input).rooms[0];
  expect(room.openings.map(opening => [opening.wallDeductionSqFt, opening.baseboardDeductionFt])).toEqual([[0.12, 0.34], [0.12, 0.34]]);
  expect(room.walls[0]).toMatchObject({ openingDeductionSqFt: 0.23, baseboardDeductionFt: 0.67, netAreaSqFt: 10.54, baseboardLengthFt: 2.62 });
  expect(room).toMatchObject({ openingDeductionSqFt: 0.23, baseboardDeductionFt: 0.67, netWallAreaSqFt: 10.54, baseboardLengthFt: 2.62 });
});

test('the selectable demo is explicitly synthetic and uses a known four-wall room', () => {
  const result = parseRoomScan(DEMO_ROOM_SCAN);
  expect(result).toMatchObject({ ready: true, scanId: 'demo-room-001', source: { mode: 'fixture' } });
  expect(result.rooms[0]).toMatchObject({ wallCount: 4, openingCount: 2, netWallAreaSqFt: 325.83, floorAreaSqFt: 129.17, baseboardLengthFt: 42.98 });
  expect(result.items.every(item => item.description.includes('DEMO FIXTURE'))).toBe(true);
});

test('all fixture rows retain the exact scan and room IDs and visible demo provenance', () => {
  const result = parseRoomScan(JSON.stringify(sample()));
  expect(result).toMatchObject({ scanId: 'scan-001', capturedAt: '2026-10-02T14:30:00Z', source: { mode: 'fixture' } });
  for (const item of result.items) {
    expect(item).toMatchObject({ roomId: 'room-001', roomName: 'Living room', category: 'Labor', unit_cost: '' });
    expect(item.description).toContain('DEMO FIXTURE');
    expect(item.description).toContain('scan-001');
    expect(item.description).toContain('room-001');
    expect(item.description.length).toBeLessThanOrEqual(300);
  }
  expect(new Set(result.items.map(item => item.key)).size).toBe(4);
});

test('device mode is described as an imported file claim, not independent hardware verification', () => {
  const input = sample();
  input.source.mode = 'device';
  const result = parseRoomScan(input);
  expect(result.ready).toBe(true);
  expect(result.items.every(item => item.description.includes('device file'))).toBe(true);
  expect(result.warnings.join(' ')).toMatch(/source|file/i);
  expect(result.warnings.join(' ')).toMatch(/verify|review/i);
});

test('missing floor capture never infers flooring or ceiling area from wall dimensions', () => {
  const input = sample();
  delete input.rooms[0].floor;
  const result = parseRoomScan(input);
  expect(result.ready).toBe(true);
  expect(result.rooms[0].floorAreaSqFt).toBeNull();
  expect(result.items.find(item => item.kind === 'floor').qty).toBe('');
  expect(result.items.find(item => item.kind === 'ceiling').qty).toBe('');
  expect(result.warnings.join(' ')).toMatch(/floor.*not.*captured/i);
});

test('unlinked openings are retained in warnings and never deducted', () => {
  const input = sample();
  input.rooms[0].openings[0].wall_id = null;
  const result = parseRoomScan(input);
  expect(result.ready).toBe(true);
  expect(result.rooms[0]).toMatchObject({ netWallAreaSqFt: 64, baseboardLengthFt: 10, unlinkedOpeningCount: 1 });
  expect(result.warnings.join(' ')).toMatch(/unlinked|without.*wall/i);
});

test('unknown floor contact still deducts wall area but never assumes baseboard deduction', () => {
  const input = sample();
  input.rooms[0].openings[0].reaches_floor = null;
  const result = parseRoomScan(input);
  expect(result.ready).toBe(true);
  expect(result.rooms[0]).toMatchObject({ netWallAreaSqFt: 43, baseboardLengthFt: 10 });
  expect(result.warnings.join(' ')).toMatch(/floor contact|baseboard/i);
});

test('a floor-height window does not become a door or baseboard deduction', () => {
  const input = sample();
  input.rooms[0].openings[1].reaches_floor = true;
  expect(parseRoomScan(input).rooms[0].baseboardLengthFt).toBe(7);
});

test('unknown non-null parent wall IDs reject corrupted deductions', () => {
  const input = sample();
  input.rooms[0].openings[0].wall_id = 'missing-wall';
  expect(parseRoomScan(input)).toMatchObject({ ready: false, items: [] });
  expect(parseRoomScan(input).errors.join(' ')).toMatch(/wall/i);
});

test('a wall in another room is not a valid opening parent', () => {
  const input = sample();
  input.rooms.push({ id: 'room-002', name: 'Bedroom', walls: [{ id: 'wall-002', length_m: 4, height_m: 3 }], openings: [] });
  input.rooms[0].openings[0].wall_id = 'wall-002';
  expect(parseRoomScan(input).ready).toBe(false);
});

test('multiple rooms produce independent deterministic quantities without mutation', () => {
  const input = sample();
  input.rooms.push({ id: 'room-002', name: 'Bedroom', walls: [{ id: 'wall-002', length_m: 6.096, height_m: 2.4384 }], openings: [] });
  const before = JSON.stringify(input);
  const first = parseRoomScan(input);
  expect(first.rooms[1]).toMatchObject({ grossWallAreaSqFt: 160, netWallAreaSqFt: 160, baseboardLengthFt: 20, floorAreaSqFt: null });
  expect(first.items).toHaveLength(8);
  expect(parseRoomScan(input)).toEqual(first);
  expect(JSON.stringify(input)).toBe(before);
});

test('low or unknown confidence remains visible for contractor review', () => {
  const input = sample();
  input.rooms[0].walls[0].confidence = 'low';
  delete input.rooms[0].openings[0].confidence;
  const result = parseRoomScan(input);
  expect(result.ready).toBe(true);
  expect(result.warnings.join(' ')).toMatch(/low/i);
  expect(result.warnings.join(' ')).toMatch(/unknown/i);
});

test.each(['3.048', NaN, Infinity, -1, 0, 100.01, true, {}, []])('rejects invalid wall dimensions %p without coercion', length_m => {
  const input = sample();
  input.rooms[0].walls[0].length_m = length_m;
  expect(parseRoomScan(input)).toMatchObject({ ready: false, items: [] });
});

test.each([
  { width_m: 4 }, { height_m: 3 }, { width_m: '0.9' }, { reaches_floor: 'true' },
  { kind: 'cabinet' }, { wall_id: 123 }, { confidence: 'certain' },
])('rejects invalid opening metadata or geometry %#', changes => {
  const input = sample();
  Object.assign(input.rooms[0].openings[0], changes);
  expect(parseRoomScan(input)).toMatchObject({ ready: false, items: [] });
});

test('combined openings cannot exceed the parent wall area', () => {
  const input = sample();
  input.rooms[0].openings = [
    { id: 'opening-1', wall_id: 'wall-001', kind: 'opening', width_m: 3, height_m: 2.4, reaches_floor: null },
    { id: 'opening-2', wall_id: 'wall-001', kind: 'opening', width_m: 3, height_m: 2.4, reaches_floor: null },
  ];
  expect(parseRoomScan(input).ready).toBe(false);
});

test('invalid opening values never invoke numeric coercion during parent geometry validation', () => {
  const input = sample();
  input.rooms[0].openings[0].width_m = { valueOf() { throw new Error('Must not coerce'); } };
  expect(parseRoomScan(input)).toMatchObject({ ready: false, items: [] });
});

test('combined floor openings cannot make the remaining baseboard length negative', () => {
  const input = sample();
  input.rooms[0].openings = [
    { id: 'opening-1', wall_id: 'wall-001', kind: 'opening', width_m: 2, height_m: 0.5, reaches_floor: true },
    { id: 'opening-2', wall_id: 'wall-001', kind: 'opening', width_m: 2, height_m: 0.5, reaches_floor: true },
  ];
  expect(parseRoomScan(input).ready).toBe(false);
});

test.each([
  { schema: 'other' }, { units: 'ft' }, { scan_id: '' }, { captured_at: 'yesterday' },
  { captured_at: '2026-02-31T14:30:00Z' }, { rooms: [] }, { rooms: {} },
  { source: { kind: 'apple-roomplan', mode: 'verified', app: 'Scanner', version: '1' } },
  { source: { kind: 'camera-photo', mode: 'device', app: 'Scanner', version: '1' } },
])('rejects invalid root metadata %#', changes => {
  expect(parseRoomScan(sample(changes))).toMatchObject({ ready: false, items: [] });
});

test.each([
  { area_m2: '12', method: 'captured-polygon' }, { area_m2: 0, method: 'captured-polygon' },
  { area_m2: Infinity, method: 'captured-polygon' }, { area_m2: 10001, method: 'captured-polygon' },
  { area_m2: 12, method: 'bounding-box' },
])('rejects unmeasured or invalid floor areas %#', floor => {
  const input = sample();
  input.rooms[0].floor = floor;
  expect(parseRoomScan(input)).toMatchObject({ ready: false, items: [] });
});

test('duplicate IDs across rooms and surfaces cannot double-count scan quantities', () => {
  const input = sample();
  input.rooms.push({ ...input.rooms[0], id: 'room-002' });
  expect(parseRoomScan(input).ready).toBe(false);
  expect(parseRoomScan(input).errors.join(' ')).toMatch(/duplicate/i);
});

test('too many rooms cannot overflow the estimator line capacity', () => {
  const input = sample();
  input.rooms = Array.from({ length: 25 }, (_, index) => ({ id: `room-${index}`, name: `Room ${index}`, walls: [{ id: `wall-${index}`, length_m: 4, height_m: 3 }], openings: [] }));
  expect(parseRoomScan(input).ready).toBe(false);
});

test('surface count limits bound import work and reject oversized rooms', () => {
  const input = sample();
  input.rooms[0].walls = Array.from({ length: 201 }, (_, index) => ({ id: `wall-${index}`, length_m: 4, height_m: 3 }));
  input.rooms[0].openings = [];
  expect(parseRoomScan(input).ready).toBe(false);
  input.rooms[0].walls = [{ id: 'wall-001', length_m: 4, height_m: 3 }];
  input.rooms[0].openings = Array.from({ length: 401 }, (_, index) => ({ id: `opening-${index}`, wall_id: null, kind: 'window', width_m: 0.1, height_m: 0.1, reaches_floor: false }));
  expect(parseRoomScan(input).ready).toBe(false);
});

test('aggregate surfaces across otherwise valid rooms obey the import limit', () => {
  const input = sample();
  input.rooms = Array.from({ length: 16 }, (_, roomIndex) => ({
    id: `room-${roomIndex}`, name: `Room ${roomIndex}`, openings: [],
    walls: Array.from({ length: 200 }, (_, wallIndex) => ({ id: `wall-${roomIndex}-${wallIndex}`, length_m: 1, height_m: 1 })),
  }));
  expect(parseRoomScan(input)).toMatchObject({ ready: false, items: [] });
  expect(parseRoomScan(input).errors.join(' ')).toMatch(/3,000/);
});

test('oversized calculated quantities cannot be transferred to a bid', () => {
  const input = sample();
  input.rooms[0].walls = Array.from({ length: 10 }, (_, index) => ({ id: `wall-${index}`, length_m: 100, height_m: 100 }));
  input.rooms[0].openings = [];
  expect(parseRoomScan(input)).toMatchObject({ ready: false, items: [] });
  expect(parseRoomScan(input).errors.join(' ')).toMatch(/quantity limit/i);
});

test.each(['{bad json', 'null', '[]', '4', null, [], false])('malformed import %p returns errors without throwing', input => {
  expect(parseRoomScan(input)).toMatchObject({ ready: false, items: [] });
});

test('room text is retained as text while provenance stays within the bid description limit', () => {
  const input = sample({ scan_id: 's'.repeat(80) });
  input.rooms[0].id = 'r'.repeat(80);
  input.rooms[0].name = '<img src=x onerror=alert(1)> Kitchen';
  const result = parseRoomScan(input);
  expect(result.ready).toBe(true);
  expect(result.rooms[0].name).toBe(input.rooms[0].name);
  expect(result.items.every(item => item.description.length <= 300 && item.description.includes(input.scan_id) && item.description.includes(input.rooms[0].id))).toBe(true);
});
