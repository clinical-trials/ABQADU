const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const deployScript = path.resolve(__dirname, '../../../deploy-platform.example.sh');
let directory;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-deployment-')); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

function write(relative, contents) {
  const destination = path.join(directory, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, contents);
}

test.each([false, true])('deployment preserves host secrets and records when local configuration exists: %s', localConfig => {
  const rsync = spawnSync('which', ['rsync'], { encoding: 'utf8' }).stdout.trim();
  expect(rsync).toBeTruthy();
  write('platform/client/build/index.html', 'new client');
  write('host/platform/client/build/index.html', 'old client');
  write('platform/server/src/index.js', 'new server');
  write('host/platform/server/src/index.js', 'old server revision');
  write('host/platform/server/obsolete.js', 'remove this old code');
  const preserved = {
    '.env': 'host fixture configuration',
    '.env.production': 'host production fixture configuration',
    'data/command-center.json': '{"fixture":"host saved jobs"}',
    'backups/snapshot.json': '{"fixture":"host backup"}',
    'config/provider.p8': 'host fixture signing key',
  };
  for (const [name, contents] of Object.entries(preserved)) {
    write(`host/platform/server/${name}`, contents);
    if (localConfig) write(`platform/server/${name}`, `local fixture ${name}`);
  }
  if (localConfig) write('platform/server/.env.staging', 'local-only configuration');

  // Execute the actual deployment script against temporary local directories.
  // Build and SSH are no-ops; the rsync wrapper refuses any real remote target.
  for (const name of ['node', 'npm', 'ssh']) {
    write(`bin/${name}`, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(path.join(directory, `bin/${name}`), 0o700);
  }
  write('bin/rsync', `#!${process.execPath}\nconst {spawnSync}=require('node:child_process');\nconst args=process.argv.slice(2);\nconst destination=args.pop();\nif(!destination.startsWith('fixture-host:'))process.exit(2);\nargs.push(destination.slice('fixture-host:'.length));\nconst result=spawnSync(${JSON.stringify(rsync)},args,{stdio:'inherit',env:{...process.env,PATH:${JSON.stringify(process.env.PATH)}}});\nprocess.exit(result.status ?? 1);\n`);
  fs.chmodSync(path.join(directory, 'bin/rsync'), 0o700);
  const result = spawnSync('bash', [deployScript], {
    cwd: directory,
    env: { ...process.env, PATH: `${path.join(directory, 'bin')}:${process.env.PATH}`, TARGET_HOST: 'fixture-host', TARGET_DIR: path.join(directory, 'host') },
    encoding: 'utf8',
  });
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
  for (const [name, contents] of Object.entries(preserved)) {
    expect(fs.existsSync(path.join(directory, `host/platform/server/${name}`))).toBe(true);
    expect(fs.readFileSync(path.join(directory, `host/platform/server/${name}`), 'utf8')).toBe(contents);
  }
  expect(fs.existsSync(path.join(directory, 'host/platform/server/.env.staging'))).toBe(false);
  expect(fs.readFileSync(path.join(directory, 'host/platform/server/src/index.js'), 'utf8')).toBe('new server');
  expect(fs.existsSync(path.join(directory, 'host/platform/server/obsolete.js'))).toBe(false);
});
