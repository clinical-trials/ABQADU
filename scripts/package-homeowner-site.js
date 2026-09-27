const fs = require('node:fs');
const path = require('node:path');
const { buildPublicSite } = require('./build-public-site');

// A generated, public-only folder travels with the Express server on deployment.
function packageHomeownerSite(source = path.resolve(__dirname, '..')) {
  const server = path.join(source, 'platform', 'server');
  fs.mkdirSync(server, { recursive: true });
  const output = path.join(server, 'public-homeowner');
  const staging = fs.mkdtempSync(path.join(server, '.public-homeowner-build-'));
  try {
    buildPublicSite(source, staging);
    fs.rmSync(output, { recursive: true, force: true });
    fs.renameSync(staging, output);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return output;
}

if (require.main === module) console.log(`Packaged homeowner website: ${packageHomeownerSite()}`);
module.exports = { packageHomeownerSite };
