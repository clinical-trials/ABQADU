jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));

const { pool } = require('../src/db');
const router = require('../src/routes/designs');
// Exercise the registered read handlers without opening a test TCP listener.
async function read(path, params = {}, query = {}) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods.get);
  await route.route.stack[0].handle({ params, query }, res, error => { throw error; });
  return { status: res.statusCode, body: res.body };
}
const templates = [
  { id: 1, slug: 'hyder-hut', name: 'Hyder Hut', description: 'Legacy description', sqft: 440, bedrooms: 1, bathrooms: 1 },
  { id: 2, slug: 'hyder-hut-2br', name: 'Hyder Hut 2BR', description: 'Legacy description', sqft: 550, bedrooms: 2, bathrooms: 1 },
  { id: 3, slug: 'altura-24x24', name: 'Altura 24×24', description: 'Existing single-bedroom plan', sqft: 576, bedrooms: 1, bathrooms: 1 },
  { id: 4, slug: 'casita-portal', name: 'Casita Portal', sqft: 640, bedrooms: 2, bathrooms: 1 },
  { id: 5, slug: 'tierra-grande', name: 'Tierra Grande', sqft: 780, bedrooms: 2, bathrooms: 2 },
  { id: 6, slug: 'bryn-mawr', name: 'Bryn Mawr', sqft: 440, bedrooms: 1, bathrooms: 1 },
  { id: 7, slug: 'custom-workshop', name: 'Custom Workshop', sqft: 300, bedrooms: 0, bathrooms: 0 },
];
beforeEach(() => pool.query.mockReset());

test('new-design choices omit retired models and show current names without inventing floor plans', async () => {
  const before = JSON.parse(JSON.stringify(templates));
  pool.query.mockResolvedValue({ rows: templates });
  const response = await read('/templates');
  expect(response.status).toBe(200);
  expect(response.body.map(row => [row.id, row.slug, row.name])).toEqual([
    [1, 'hyder-hut', 'Netherwood 440'],
    [2, 'hyder-hut-2br', 'Netherwood 550'],
    [3, 'altura-24x24', 'Altura 576'],
    [7, 'custom-workshop', 'Custom Workshop'],
  ]);
  expect(response.body[0].description).not.toMatch(/Hyder|Legacy/);
  expect(response.body.map(row => row.sqft)).toEqual([440, 550, 576, 300]);
  expect(templates).toEqual(before);
});

test.each([4, 5, 6])('retired template %s remains readable by ID with its original layout', async id => {
  const template = templates.find(row => row.id === id);
  const design = { id: 20 + id, template_id: id, rooms: [{ id: 'existing-room', x: 12, y: 24, w: 180, h: 120 }] };
  pool.query.mockResolvedValueOnce({ rows: [template] }).mockResolvedValueOnce({ rows: [design] });
  const response = await read('/templates/:id', { id: String(id) });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ template, design });
});

test('saved designs retain their legacy identity, rooms and project association', async () => {
  const saved = [{ id: 91, project_id: 10, template_id: 4, template_name: 'Casita Portal', name: 'Saved job design', rooms: [{ id: 'original', w: 120, h: 144 }] }];
  pool.query.mockResolvedValue({ rows: saved });
  const response = await read('/', {}, { project_id: '10' });
  expect(response.status).toBe(200);
  expect(response.body).toEqual(saved);
});
