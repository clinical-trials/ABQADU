const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let directory;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-local-launcher-')); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

test('local launch loads existing environment without editing it and explicitly selects development loopback', () => {
  const { configureLocalEnvironment } = require('../scripts/start-local');
  const envFile = path.join(directory, '.env');
  const contents = 'DATABASE_URL=postgresql://localhost/fixture\nHOST=0.0.0.0\nPORT=4000\n';
  fs.writeFileSync(envFile, contents);
  const env = { DATABASE_URL: 'postgresql://localhost/inherited' };
  configureLocalEnvironment({ env, envFile });
  expect(env).toMatchObject({ NODE_ENV: 'development', HOST: '127.0.0.1', ABQ_LOCAL_WORKSPACE: '1', PORT: '4000', DATABASE_URL: 'postgresql://localhost/inherited' });
  expect(fs.readFileSync(envFile, 'utf8')).toBe(contents);
});

test.each([
  [{ NODE_ENV: 'production' }, ''],
  [{}, 'NODE_ENV=production\n'],
  [{ NODE_ENV: 'development' }, 'NODE_ENV=production\n'],
])('local launch refuses production inherited or present in the environment file', (env, contents) => {
  const { configureLocalEnvironment } = require('../scripts/start-local');
  const envFile = path.join(directory, '.env');
  fs.writeFileSync(envFile, contents);
  expect(() => configureLocalEnvironment({ env, envFile })).toThrow(/production/i);
  expect(env.ABQ_LOCAL_WORKSPACE).toBeUndefined();
});

test.each(['admin', 'clerk', 'misspelled-mode'])('local launch preserves explicit %s authentication instead of enabling a bypass', mode => {
  const { configureLocalEnvironment } = require('../scripts/start-local');
  const envFile = path.join(directory, '.env');
  fs.writeFileSync(envFile, `ABQ_AUTH_MODE=${mode}\nABQ_LOCAL_WORKSPACE=1\n`);
  const env = {};
  configureLocalEnvironment({ env, envFile });
  expect(env).toMatchObject({ ABQ_AUTH_MODE: mode, ABQ_LOCAL_WORKSPACE: '0', HOST: '127.0.0.1' });
});
