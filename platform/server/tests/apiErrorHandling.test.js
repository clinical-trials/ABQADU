const { spawnSync } = require('node:child_process');
const path = require('node:path');

const serverDirectory = path.join(__dirname, '..');

// A child process proves a rejected query cannot terminate the running server.
// Only the external database boundary is replaced; requests use the real app.
function requestWithDatabaseFailure(code) {
  const script = `
    const { pool } = require('./src/db');
    pool.query = async () => {
      throw Object.assign(new Error('private database connection details'), {
        code: ${JSON.stringify(code)},
      });
    };
    const app = require('./src/index');
    const server = app.listen(0, '127.0.0.1', async () => {
      try {
        const origin = 'http://127.0.0.1:' + server.address().port;
        const response = await fetch(origin + '/api/portfolio');
        const body = await response.json();
        const health = await fetch(origin + '/health');
        console.log('RESULT:' + JSON.stringify({
          status: response.status, body,
          healthStatus: health.status, health: await health.json(),
        }));
        process.exit(0);
      } catch (error) {
        console.error(error);
        process.exit(1);
      }
    });
  `;
  const result = spawnSync(process.execPath, ['--unhandled-rejections=strict', '-e', script], {
    cwd: serverDirectory,
    env: { ...process.env, PORT: '0' },
    encoding: 'utf8',
    timeout: 10000,
  });
  if (result.status !== 0) {
    throw new Error(`Server exited before completing the API and health requests (${result.status}): ${result.stderr}`);
  }
  const output = result.stdout.split('\n').find(line => line.startsWith('RESULT:'));
  return { ...JSON.parse(output.slice('RESULT:'.length)), logs: result.stderr };
}

describe('API failures remain isolated to their request', () => {
  test.each(['3D000', 'ECONNREFUSED', '57P03'])('database failure %s returns 503 and leaves health available', code => {
    const response = requestWithDatabaseFailure(code);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Database unavailable. Please try again shortly.' });
    expect(response.healthStatus).toBe(200);
    expect(response.health).toEqual({ ok: true });
    expect(response.logs).toContain('private database connection details');
  });

  test('unexpected errors return generic JSON without exposing internal details', () => {
    const response = requestWithDatabaseFailure('UNEXPECTED');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(response.healthStatus).toBe(200);
    expect(response.health).toEqual({ ok: true });
  });
});
