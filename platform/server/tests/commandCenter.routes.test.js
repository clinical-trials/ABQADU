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

const modelFixture = {
  id: 'fixture-model-choice', client: 'Example homeowner', address: 'Example site',
  model_id: 'netherwood-440', model: 'Netherwood 440', sqft: 613.25,
  bedrooms: 2, bathrooms: 1.5, bid_total: 197345.67,
  cogs_low: 112345.67, cogs_high: 134567.89,
  notes: 'Keep this independently prepared estimate while the model is undecided.',
};

async function withModelRoute(check) {
  const originalStorePath = process.env.COMMAND_CENTER_STORE_PATH;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abqadu-other-model-'));
  const storePath = path.join(directory, 'store.json');
  fs.writeFileSync(storePath, JSON.stringify({
    version: 'Version 10', updated_at: '2026-10-01T12:00:00.000Z',
    projects: [modelFixture], activity_events: [],
  }, null, 2));
  process.env.COMMAND_CENTER_STORE_PATH = storePath;
  jest.resetModules();
  try {
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/api/command-center', require('../src/routes/commandCenter'));
    await check(require('supertest')(app), storePath);
  } finally {
    if (originalStorePath === undefined) delete process.env.COMMAND_CENTER_STORE_PATH;
    else process.env.COMMAND_CENTER_STORE_PATH = originalStorePath;
    jest.resetModules();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function run() {
  assertIncludes(routeFile, "router.get('/'");
  assertIncludes(routeFile, "router.put('/'");
  assertIncludes(routeFile, "router.post('/reset'");
  assertIncludes(routeFile, "router.post('/activity'");
  assertIncludes(storeFile, 'version10-command-center.json');
  assertIncludes(storeFile, 'Version 10');
  assertIncludes(indexFile, "app.use('/api/command-center'");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abqadu-command-center-'));
  process.env.COMMAND_CENTER_STORE_PATH = path.join(tmp, 'store.json');
  jest.resetModules();
  const store = require('../src/services/commandCenterStore');
  const initial = await store.resetCommandCenter();
  expect(initial.version).toBe('Version 10');
  expect(initial.projects.length).toBeGreaterThan(0);
  const saved = await store.saveCommandCenter({ projects: [{ id: 'demo', client: 'Demo', address: 'ABQ', model: 'Netherwood', sqft: 440 }] });
  expect(saved.projects[0].model).toBe('Netherwood');
  const loaded = await store.loadCommandCenter();
  expect(loaded.projects[0].id).toBe('demo');
}

if (typeof test === 'function') {
  test('command center route and JSON store are registered', run);

  test('saving Other persists through reload without applying catalog area or pricing defaults', async () => {
    await withModelRoute(async (request, storePath) => {
      const undecided = { ...modelFixture, model_id: 'other', model: 'Other / not yet selected' };
      const saved = await request.put('/api/command-center').send({ projects: [undecided] });
      expect(saved.status).toBe(200);
      expect(saved.body.projects).toHaveLength(1);
      expect(saved.body.projects[0]).toMatchObject(undecided);
      expect(JSON.parse(fs.readFileSync(storePath, 'utf8')).projects[0]).toMatchObject(undecided);

      const reloaded = await request.get('/api/command-center');
      expect(reloaded.status).toBe(200);
      expect(reloaded.body.projects[0]).toEqual(saved.body.projects[0]);
      expect(reloaded.body.projects[0]).toMatchObject(undecided);
    });
  });

  test('internal commentary preserves multiline literal markup without copying it into activity summaries', async () => {
    await withModelRoute(async (request, storePath) => {
      const internalNotes = 'PRIVATE-COMMENT-FIXTURE\nReview <strong>sample options</strong> & measurements.\n<img src=x onerror="window.fixtureExecuted=true">';
      const project = { ...modelFixture, internal_notes: internalNotes };
      const saved = await request.put('/api/command-center').send({ projects: [project] });
      expect(saved.status).toBe(200);
      expect(saved.body.projects[0].internal_notes).toBe(internalNotes);
      expect(JSON.parse(fs.readFileSync(storePath, 'utf8')).projects[0].internal_notes).toBe(internalNotes);

      const reloaded = await request.get('/api/command-center');
      expect(reloaded.status).toBe(200);
      expect(reloaded.body.projects[0]).toMatchObject(project);
      expect(reloaded.body.activity_events).toHaveLength(1);
      expect(reloaded.body.activity_events[0]).toMatchObject({
        project_id: modelFixture.id, type: 'project.updated', changed_fields: ['internal_notes'],
        summary: 'Updated internal notes.',
      });
      expect(JSON.stringify(reloaded.body.activity_events)).not.toMatch(/PRIVATE-COMMENT-FIXTURE|sample options|fixtureExecuted|<img/);
    });
  });

  test('current client preview and packet renderer omit internal commentary', async () => {
    await withModelRoute(async request => {
      const internalNotes = 'INTERNAL-ONLY-PACKET-FIXTURE\n<b>Example staff discussion</b> & follow-up.';
      const saved = await request.put('/api/command-center').send({ projects: [{ ...modelFixture, internal_notes: internalNotes }] });
      expect(saved.status).toBe(200);
      const preview = await request.get(`/api/command-center/projects/${modelFixture.id}/client-view-preview`);
      expect(preview.status).toBe(200);
      expect(preview.body.project).toMatchObject({ id: modelFixture.id, client: modelFixture.client });
      expect(preview.body).not.toHaveProperty('internal_notes');
      expect(preview.body.project).not.toHaveProperty('internal_notes');
      expect(JSON.stringify(preview.body)).not.toMatch(/internal_notes|INTERNAL-ONLY-PACKET-FIXTURE|Example staff discussion/);

      const { renderClientPacketHtml } = require('../src/services/clientPacketPdf');
      for (const payload of [preview.body, {
        ...preview.body, internal_notes: internalNotes,
        project: { ...preview.body.project, internal_notes: internalNotes },
      }]) {
        const html = renderClientPacketHtml(payload);
        expect(html).toContain(modelFixture.client);
        expect(html).not.toMatch(/internal_notes|INTERNAL-ONLY-PACKET-FIXTURE|Example staff discussion|&lt;b&gt;/);
      }
    });
  });

  test.each([
    { model_id: 'other' },
    { model: 'Other / not yet selected' },
  ])('applying the undecided model %j is rejected without changing the saved file', async body => {
    await withModelRoute(async (request, storePath) => {
      const before = fs.readFileSync(storePath, 'utf8');
      const response = await request.post(`/api/command-center/projects/${modelFixture.id}/apply-model`).send(body);
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Unknown model/);
      expect(fs.readFileSync(storePath, 'utf8')).toBe(before);

      const reloaded = await request.get('/api/command-center');
      expect(reloaded.status).toBe(200);
      expect(reloaded.body.projects[0]).toMatchObject(modelFixture);
      expect(fs.readFileSync(storePath, 'utf8')).toBe(before);
    });
  });
} else {
  run().then(() => console.log('Command center static checks passed'));
}
