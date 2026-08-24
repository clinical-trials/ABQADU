const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const guide = fs.readFileSync(path.join(root, 'docs/version-10-platform-deployment.md'), 'utf8');
const script = fs.readFileSync(path.join(root, 'deploy-platform.example.sh'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function contains(file, snippet) {
  assert(file.includes(snippet), `Expected content to contain: ${snippet}`);
}

contains(guide, 'Version 10 Platform Deployment');
contains(guide, 'Local test URL');
contains(guide, 'LAN URL');
contains(guide, 'Public external URL');
contains(guide, 'Static-only GitHub Pages is insufficient');
contains(guide, 'public host or tunnel');
contains(guide, 'npm run build');
contains(guide, 'npm start');
contains(guide, 'COMMAND_CENTER_STORE_PATH');
contains(script, 'TARGET_HOST');
contains(script, 'platform/client/build');
contains(script, 'platform/server');
contains(index, 'Version 10 Homeowner Design Experience');

console.log('Version 10 deployment docs checks passed');
