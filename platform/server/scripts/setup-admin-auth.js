const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createAdminCredential, defaultCredentialFile } = require('../src/adminAuth');

async function setupAdminAuth({ password, credentialFile = defaultCredentialFile, handoffFile } = {}) {
  if (password === undefined && !handoffFile) throw new Error('Choose protected stdin input or a private handoff file.');
  const generated = password === undefined;
  const value = generated ? randomBytes(24).toString('base64url') : password;
  const credential = await createAdminCredential(value);
  const destination = path.resolve(credentialFile);
  if (handoffFile && path.resolve(handoffFile) === destination) throw new Error('Credential and handoff files must be separate.');
  let created = false;
  try {
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    // Exclusive creation prevents accidental replacement of the current account.
    await fs.writeFile(destination, `${JSON.stringify(credential, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    created = true;
    if (generated) {
      await fs.writeFile(path.resolve(handoffFile), `ABQ ADU workspace\nUsername: admin\nPassword: ${value}\n\nSave this password privately, then delete this handoff file.\n`, { flag: 'wx', mode: 0o600 });
    }
  } catch {
    if (created) await fs.unlink(destination).catch(() => {});
    throw new Error('Admin setup could not create the private files. Use new writable paths; existing files are never replaced.');
  }
}

async function main(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (['--credential-file', '--handoff-file'].includes(key)) {
      if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('A private file path is required.');
      options[key === '--credential-file' ? 'credentialFile' : 'handoffFile'] = args[++index];
    } else if (key === '--generate' || key === '--stdin') options[key.slice(2)] = true;
    else throw new Error('Use --generate --handoff-file PATH or --stdin, with optional --credential-file PATH.');
  }
  if (Boolean(options.generate) === Boolean(options.stdin) || (options.stdin && options.handoffFile)
    || (options.generate && !options.handoffFile)) throw new Error('Choose --generate --handoff-file PATH or --stdin.');
  if (options.stdin) {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk.toString('utf8');
      if (Buffer.byteLength(input) > 4096) throw new Error('Password input is too large.');
    }
    try {
      const value = JSON.parse(input);
      if (typeof value.password !== 'string' || Object.keys(value).length !== 1) throw new Error();
      options.password = value.password;
    } catch { throw new Error('Provide a JSON object containing only password on protected stdin.'); }
  }
  await setupAdminAuth(options);
  console.log('Admin credential file created. Configure admin mode and restart the server.');
}

if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { setupAdminAuth };
