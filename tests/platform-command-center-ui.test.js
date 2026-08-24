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
contains(page, "fetch(`/api/weather/forecast?zip=");
contains(page, "fetch('/api/weather/forecast/activity'");
contains(page, "fetch(`/api/command-center/projects/");
contains(page, 'Builder Operating System');
contains(page, 'Server-backed Version 10');
contains(page, 'Version 10');
contains(page, 'Project Intake');
contains(page, 'Best contact time');
contains(page, 'Apply Model Defaults');
contains(page, 'Create $10k Invoice');
contains(page, 'Send to COGS');
contains(page, 'SIP/PUR vs Conventional');
contains(page, 'Crew Messages');
contains(page, "Lowe's");
contains(page, 'RAKS');
contains(page, 'Rio Grande');
contains(page, 'SIP/PUR panel supplier');
contains(page, 'Conventional build package');
contains(page, 'Preview Client View');
contains(page, 'Print Client Packet');
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
contains(page, 'Weather Delay Assessor');
contains(page, 'Check Weather');
contains(page, 'Log Weather Risk');
contains(page, 'Text Weather Crew');

console.log('Version 10 command center UI checks passed');
