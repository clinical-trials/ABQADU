const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'platform/client/src/App.jsx'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '..', 'platform/client/src/pages/CommandCenter.jsx'), 'utf8');

function contains(file, snippet) {
  assert(file.includes(snippet), `Expected file to contain: ${snippet}`);
}

contains(app, "import CommandCenter from './pages/CommandCenter'");
contains(app, 'AppNavigation');
contains(app, '<Route path="/command-center"');
contains(page, "useCommandCenter()");
contains(page, "runAction('/api/command-center/activity'");
contains(page, "apiFetch('/api/integrations/status')");
contains(page, "runAction('/api/integrations/sms/send'");
contains(page, 'runAction(`/api/billing/command-center/');
contains(page, "runAction('/api/integrations/ocr/receipt'");
contains(page, "runAction('/api/integrations/clerk/status')");
contains(page, "runAction(`/api/weather/forecast?zip=");
contains(page, "runAction('/api/weather/forecast/activity'");
contains(page, "runAction(`/api/command-center/projects/");
contains(page, '<ContractorDesk');
contains(page, 'Estimates, costs &amp; office tools');
contains(page, "maxWidth: 1440");
contains(page, "headerInner");
contains(page, "gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, .65fr)'");
contains(page, "className=\"v10-shell\"");
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
contains(page, '<IntegrationSetup');
contains(page, 'Send Live SMS');
contains(page, 'Create invoices from saved drafts');
contains(page, 'Read Receipt Text');
contains(page, 'Check Sign-in Settings');
contains(page, 'Supplier Quote Comparator');
contains(page, 'Receipt Text Entry');
contains(page, 'Mileage Tracker Demo');
contains(page, 'Weather Delay Assessor');
contains(page, 'Check Weather');
contains(page, 'Log Weather Risk');
contains(page, 'Text Weather Crew');

console.log('Version 10 command center UI checks passed');
