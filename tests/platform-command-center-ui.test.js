const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'platform/client/src/App.jsx'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '..', 'platform/client/src/pages/CommandCenter.jsx'), 'utf8');

function contains(file, snippet) {
  assert(file.includes(snippet), `Expected file to contain: ${snippet}`);
}

contains(app, "import CommandCenter from './pages/CommandCenter'");
contains(app, "{ to: '/command-center', label: 'Command' }");
contains(app, '<Route path="/command-center"');
contains(page, "fetch('/api/command-center')");
contains(page, "fetch('/api/command-center/activity'");
contains(page, 'Builder Command Center');
contains(page, 'Server-backed Version 9 demo');
contains(page, 'Supplier Quote Comparator');
contains(page, 'Receipt Scanner Demo');
contains(page, 'Mileage Tracker Demo');
contains(page, 'Simulate Client View');

console.log('Version 9 command center UI checks passed');
