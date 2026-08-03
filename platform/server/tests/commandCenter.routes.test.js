const fs = require('fs');
const os = require('os');
const path = require('path');

const routeFile = path.join(__dirname, '..', 'src', 'routes', 'commandCenter.js');
const storeFile = path.join(__dirname, '..', 'src', 'services', 'commandCenterStore.js');
const indexFile = path.join(__dirname, '..', 'src', 'index.js');

function assertIncludes(file, text) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes(text)) throw new Error(`${file} missing ${text}`);
}

async function run() {
  assertIncludes(routeFile, "router.get('/'");
  assertIncludes(routeFile, "router.put('/'");
  assertIncludes(routeFile, "router.post('/reset'");
  assertIncludes(routeFile, "router.post('/activity'");
  assertIncludes(storeFile, 'version9-command-center.json');
  assertIncludes(storeFile, 'Version 9');
  assertIncludes(indexFile, "app.use('/api/command-center'");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abqadu-command-center-'));
  process.env.COMMAND_CENTER_STORE_PATH = path.join(tmp, 'store.json');
  jest.resetModules();
  const store = require('../src/services/commandCenterStore');
  const initial = await store.resetCommandCenter();
  expect(initial.version).toBe('Version 9');
  expect(initial.projects.length).toBeGreaterThan(0);
  const saved = await store.saveCommandCenter({ projects: [{ id: 'demo', client: 'Demo', address: 'ABQ', model: 'Netherwood', sqft: 440 }] });
  expect(saved.projects[0].model).toBe('Netherwood');
  const loaded = await store.loadCommandCenter();
  expect(loaded.projects[0].id).toBe('demo');
}

if (typeof test === 'function') {
  test('command center route and JSON store are registered', run);
} else {
  run().then(() => console.log('Command center static checks passed'));
}
