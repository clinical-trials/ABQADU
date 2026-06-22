const { runCPM } = require('../src/services/cpm');

function act(id, dur) { return { id, duration_days: dur }; }
function dep(pid, sid, type = 'FS', lag = 0) {
  return { predecessor_id: pid, successor_id: sid, dep_type: type, lag_days: lag };
}
function byId(results, id) { return results.find(a => a.id === id); }

test('linear chain: A(3)→B(2)→C(4)', () => {
  const acts = [act(1, 3), act(2, 2), act(3, 4)];
  const deps = [dep(1, 2), dep(2, 3)];
  const res = runCPM(acts, deps);

  expect(byId(res, 1)).toMatchObject({ es: 0, ef: 3, total_float: 0, is_critical: true });
  expect(byId(res, 2)).toMatchObject({ es: 3, ef: 5, total_float: 0, is_critical: true });
  expect(byId(res, 3)).toMatchObject({ es: 5, ef: 9, total_float: 0, is_critical: true });
});

test('parallel paths: A(3) and B(5) both feed C(4)', () => {
  const acts = [act(1, 3), act(2, 5), act(3, 4)];
  const deps = [dep(1, 3), dep(2, 3)];
  const res = runCPM(acts, deps);

  // B is critical (longer path)
  expect(byId(res, 2)).toMatchObject({ es: 0, ef: 5, is_critical: true });
  expect(byId(res, 3)).toMatchObject({ es: 5, ef: 9, is_critical: true });
  // A has float = 2
  expect(byId(res, 1)).toMatchObject({ total_float: 2, is_critical: false });
});

test('SS dependency with lag', () => {
  const acts = [act(1, 5), act(2, 4)];
  const deps = [dep(1, 2, 'SS', 1)];
  const res = runCPM(acts, deps);

  // B starts 1 work day after A starts
  expect(byId(res, 2)).toMatchObject({ es: 1, ef: 5 });
});

test('FF dependency', () => {
  const acts = [act(1, 5), act(2, 3)];
  const deps = [dep(1, 2, 'FF', 0)];
  const res = runCPM(acts, deps);

  // B must finish no earlier than A finishes → EF_B >= EF_A
  // A: es=0, ef=5. B: ef=5, es=2
  expect(byId(res, 2)).toMatchObject({ ef: 5, es: 2 });
});

test('FS with positive lag', () => {
  const acts = [act(1, 3), act(2, 2)];
  const deps = [dep(1, 2, 'FS', 2)];
  const res = runCPM(acts, deps);

  expect(byId(res, 2)).toMatchObject({ es: 5, ef: 7 });
});

test('cycle detection throws', () => {
  const acts = [act(1, 2), act(2, 2)];
  const deps = [dep(1, 2), dep(2, 1)];
  expect(() => runCPM(acts, deps)).toThrow('Cycle detected');
});

test('free float: non-critical activity with slack', () => {
  const acts = [act(1, 3), act(2, 5), act(3, 4)];
  const deps = [dep(1, 3), dep(2, 3)];
  const res = runCPM(acts, deps);

  // A finishes at 3, C starts at 5 → free float = 5 - 3 = 2
  expect(byId(res, 1).free_float).toBe(2);
});
