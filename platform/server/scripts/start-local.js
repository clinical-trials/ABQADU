const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

function configureLocalEnvironment({ env = process.env, envFile = path.resolve(__dirname, '../.env') } = {}) {
  let fileEnv = {};
  try {
    fileEnv = dotenv.parse(fs.readFileSync(envFile));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('The local server environment file could not be read.');
  }
  if ([env.NODE_ENV, fileEnv.NODE_ENV].some(value => String(value || '').trim().toLowerCase() === 'production')) {
    throw new Error('Local workspace startup refused: NODE_ENV=production is present in the environment or server .env file.');
  }
  // Preserve inherited configuration and never write back to the environment file.
  for (const [key, value] of Object.entries(fileEnv)) if (env[key] === undefined) env[key] = value;
  Object.assign(env, { ABQ_LOCAL_WORKSPACE: env.ABQ_AUTH_MODE ? '0' : '1', NODE_ENV: 'development', HOST: '127.0.0.1' });
  env.PORT = env.PORT || '4000';
  return env;
}

if (require.main === module) {
  try {
    configureLocalEnvironment();
    const app = require('../src/index');
    const port = process.env.PORT;
    const server = app.listen(port, '127.0.0.1', () => {
      console.log(`ABQ ADU ${process.env.ABQ_AUTH_MODE ? 'sign-in workspace' : 'local development workspace'}: http://127.0.0.1:${port}`);
    });
    server.on('error', error => {
      console.error(`Local workspace server could not listen (${error.code || 'startup error'}).`);
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { configureLocalEnvironment };
