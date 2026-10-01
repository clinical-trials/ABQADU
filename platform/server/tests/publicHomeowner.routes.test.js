const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { createAuthFixture } = require('./helpers/authFixture');

jest.mock('../src/db', () => ({ pool: { query: jest.fn(async () => ({ rows: [] })) } }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));

const { createApp } = require('../src/index');
const fixture = createAuthFixture();
const websiteRoot = path.resolve(__dirname, '../../..');
let temporaryRoot;
let sourceRoot;
let bundledRoot;
let clientBuild;

function write(root, filename, content) {
  const destination = path.join(root, filename);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}

function appWithFiles(options = {}) {
  return createApp({
    env: fixture.env,
    publicHomeowner: { bundledRoot, sourceRoot },
    clientBuild,
    ...options,
  });
}

beforeEach(() => {
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-homeowner-routes-'));
  sourceRoot = path.join(temporaryRoot, 'website');
  bundledRoot = path.join(temporaryRoot, 'public-homeowner');
  clientBuild = path.join(temporaryRoot, 'client-build');
  write(sourceRoot, 'index.html', '<!doctype html><title>Public homeowner source</title>');
  write(sourceRoot, 'images/hero.svg', '<svg xmlns="http://www.w3.org/2000/svg"><title>Public hero</title></svg>');
  write(sourceRoot, 'favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  write(sourceRoot, 'data/model-catalog.json', '{"models":[{"name":"Homeowner model"}]}');
  write(clientBuild, 'index.html', '<!doctype html><title>Private workspace shell</title><div id="root"></div>');
});

afterEach(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));

test.each(['/', '/index.html'])('%s serves homeowner trades and assessment form without a session or auth configuration', async url => {
  const app = appWithFiles({ env: {}, publicHomeowner: { bundledRoot, sourceRoot: websiteRoot } });
  const response = await request(app).get(url);
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/text\/html/);
  expect(response.text).toContain('id="contractors"');
  expect(response.text).toContain('data-service-request="Stucco"');
  expect(response.text).toContain('data-service-request="Yardwork"');
  expect(response.text).toContain('data-service-request="House cleaning"');
  expect(response.text).toContain('id="assessment-form"');
  expect(response.text).not.toContain('Private workspace shell');
});

test('source assets are available from the same server without authentication', async () => {
  const app = appWithFiles();
  const homepage = await request(app).get('/');
  expect(homepage.text).toContain('Public homeowner source');
  const image = await request(app).get('/images/hero.svg');
  expect(image.status).toBe(200);
  expect(image.headers['content-type']).toMatch(/image\/svg\+xml/);
  const favicon = await request(app).get('/favicon.svg');
  expect(favicon.status).toBe(200);
  expect(favicon.headers['content-type']).toMatch(/image\/svg\+xml/);
  const catalog = await request(app).get('/data/model-catalog.json');
  expect(catalog.status).toBe(200);
  expect(catalog.body).toEqual({ models: [{ name: 'Homeowner model' }] });
});

test.each([
  ['selections.html', 'text/html', '<!doctype html><title>Homeowner selections</title>'],
  ['homeowner-selections.js', 'javascript', 'window.selectionsFixture = true;'],
  ['homeowner-selections.css', 'text/css', '.selections { color: green; }'],
])('the selections worksheet file %s is public without Clerk configuration', async (filename, type, content) => {
  write(sourceRoot, filename, content);
  const response = await request(appWithFiles({ env: {} })).get(`/${filename}`);
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain(type);
  expect(response.text).toBe(content);
});

test('an incomplete selections release does not serve the private shell or mix source assets', async () => {
  write(sourceRoot, 'selections.html', 'Old source selections');
  write(sourceRoot, 'homeowner-selections.js', 'Old source script');
  write(bundledRoot, 'index.html', '<title>Bundled homepage</title>');
  const app = appWithFiles();
  const page = await request(app).get('/selections.html');
  expect(page.status).toBe(503);
  expect(page.text).not.toMatch(/Private workspace shell|Old source/);
  for (const file of ['homeowner-selections.js', 'homeowner-selections.css']) {
    const response = await request(app).get(`/${file}`);
    expect(response.status).toBe(404);
    expect(response.text).not.toMatch(/Private workspace shell|Old source/);
  }
});

test('a bundled homeowner site takes precedence over source assets', async () => {
  write(bundledRoot, 'index.html', '<!doctype html><title>Bundled homeowner page</title>');
  write(bundledRoot, 'data/model-catalog.json', '{"models":[{"name":"Bundled model"}]}');
  const app = appWithFiles();
  expect((await request(app).get('/')).text).toContain('Bundled homeowner page');
  expect((await request(app).get('/data/model-catalog.json')).body).toEqual({ models: [{ name: 'Bundled model' }] });
  // Missing bundled files must not be filled in with source files from another release.
  expect((await request(app).get('/images/hero.svg')).status).toBe(404);
});

test.each(['/images/missing.png', '/images/', '/images', '/data/missing.json', '/data/', '/favicon.png'])('missing public asset %s returns 404 instead of the React shell', async url => {
  const response = await request(appWithFiles()).get(url);
  expect(response.status).toBe(404);
  expect(response.text).not.toContain('Private workspace shell');
});

test('the public allowlist cannot expose source, private data, dotfiles, or an image symlink outside its directory', async () => {
  const privateFiles = [
    '.env', 'server/src/index.js', 'platform/server/src/index.js', 'platform/server/data/clients.json',
    'data/private-clients.json', 'docs/operations.md', 'backups/snapshot.json', 'images/.env', 'images/source.js',
  ];
  for (const filename of privateFiles) write(sourceRoot, filename, `PRIVATE FILE: ${filename}`);
  write(sourceRoot, 'private.png', 'PRIVATE IMAGE SYMLINK TARGET');
  fs.symlinkSync(path.join(sourceRoot, 'private.png'), path.join(sourceRoot, 'images/leaked.png'));
  const app = appWithFiles();
  for (const filename of [...privateFiles, 'images/leaked.png', 'images/%2e%2e%2f.env']) {
    const response = await request(app).get(`/${filename}`);
    expect(response.text || '').not.toContain('PRIVATE FILE:');
    expect(response.body?.toString() || '').not.toContain('PRIVATE IMAGE SYMLINK TARGET');
  }
  expect((await request(app).get('/images/leaked.png')).status).toBe(404);
  expect((await request(app).get('/images/source.js')).status).toBe(404);
});

test('the legacy entry redirects to the authenticated workspace while workspace routes retain their React shell', async () => {
  write(sourceRoot, 'platform.html', 'PRIVATE LEGACY PLATFORM CONTENT');
  const app = appWithFiles();
  const legacy = await request(app).get('/platform.html');
  expect(legacy.status).toBe(302);
  expect(legacy.headers.location).toBe('/command-center');
  expect(legacy.text).not.toContain('PRIVATE LEGACY PLATFORM CONTENT');
  for (const url of ['/command-center', '/portfolio']) {
    const response = await request(app).get(url);
    expect(response.status).toBe(200);
    expect(response.text).toContain('Private workspace shell');
    expect(response.text).not.toContain('Public homeowner source');
  }
});

test.each(['missing source', 'incomplete bundle'])('%s returns a public availability page instead of private sign-in', async situation => {
  if (situation === 'missing source') fs.rmSync(sourceRoot, { recursive: true });
  else fs.mkdirSync(bundledRoot);
  const app = appWithFiles();
  for (const url of ['/', '/index.html']) {
    const response = await request(app).get(url);
    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.text).toMatch(/homeowner website.+unavailable/i);
    expect(response.text).not.toContain('Private workspace shell');
    expect(response.text).not.toContain(sourceRoot);
  }
});

test('serving public pages leaves private reads and writes behind session authentication', async () => {
  const app = appWithFiles();
  expect((await request(app).get('/')).status).toBe(200);
  for (const url of ['/api/projects', '/api/clients', '/api/invoices', '/api/command-center', '/api/portfolio']) {
    for (const method of ['get', 'post']) {
      const response = await request(app)[method](url);
      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toMatch(/application\/json/);
    }
  }
  const locked = await request(appWithFiles({ env: {} })).get('/api/projects');
  expect(locked.status).toBe(503);
});
