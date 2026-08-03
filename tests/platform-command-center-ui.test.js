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
contains(page, "fetch('/api/integrations/status')");
contains(page, "fetch('/api/integrations/sms/send'");
contains(page, "fetch('/api/integrations/stripe/checkout'");
contains(page, "fetch('/api/integrations/ocr/receipt'");
contains(page, "fetch('/api/integrations/clerk/status')");
contains(page, 'Builder Command Center');
contains(page, 'Server-backed Version 9 demo');
contains(page, 'Add Project');
contains(page, 'updateList(\'projects\'');
contains(page, 'Live Integration Status');
contains(page, 'Send Live SMS');
contains(page, 'Create Stripe Payment Link');
contains(page, 'Parse Receipt OCR');
contains(page, 'Check Clerk Login');
contains(page, 'Supplier Quote Comparator');
contains(page, 'Receipt Scanner Demo');
contains(page, 'Mileage Tracker Demo');
contains(page, 'Simulate Client View');

console.log('Version 9 command center UI checks passed');
