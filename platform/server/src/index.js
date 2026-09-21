require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const errorHandler = require('./errorHandler');
const { createWorkspaceAuth } = require('./auth');

function createApp({ env = process.env } = {}) {
  const app = express();
  const auth = createWorkspaceAuth(env);

  app.get('/health', (_, res) => res.json({ ok: true }));
  app.get('/api/auth/config', auth.publicConfig);
  // Stripe authenticates this one public endpoint with a signature over the raw bytes.
  const billing = require('./routes/billing');
  app.post('/api/billing/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), billing.stripeWebhook);
  app.use('/api', auth.checkOrigin, cors({
    origin: auth.origins,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }), auth.requireSession);
  app.use(express.json({ limit: '15mb' }));
  app.get('/api/auth/session', (req, res) => res.json({ userId: req.workspaceAuth.userId }));

  app.use('/api/billing', billing);
  app.use('/api/projects',     require('./routes/projects'));
  app.use('/api/wbs',          require('./routes/wbs'));
  app.use('/api/activities',   require('./routes/activities'));
  app.use('/api/dependencies', require('./routes/dependencies'));
  app.use('/api/calendars',    require('./routes/calendars'));
  app.use('/api/baselines',    require('./routes/baselines'));
  app.use('/api/resources',    require('./routes/resources'));
  app.use('/api/assignments',  require('./routes/assignments'));
  app.use('/api/schedule',     require('./routes/schedule'));
  app.use('/api/field-tasks',  require('./routes/fieldTasks'));
  app.use('/api/risks',        require('./routes/risks'));
  app.use('/api/comments',     require('./routes/comments'));
  app.use('/api/portfolio',    require('./routes/portfolio'));
  app.use('/api/reports',      require('./routes/reports'));
  app.use('/api/claude',       require('./routes/claude'));
  app.use('/api/designs',      require('./routes/designs'));
  app.use('/api/claude-design', require('./routes/claudeDesign'));
  app.use('/api/clients',      require('./routes/clients'));
  app.use('/api/bids',         require('./routes/bids'));
  app.use('/api/invoices',     require('./routes/invoices'));
  app.use('/api/invoice-engine', require('./routes/invoiceEngine'));
  app.use('/api/command-center', require('./routes/commandCenter'));
  app.use('/api/integrations', require('./routes/productionIntegrations'));
  app.use('/api/weather', require('./routes/weather'));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));

  // Serve the built React client so the whole platform runs on one port.
  // (Falls through when no build exists yet, e.g. API-only dev.)
  const clientBuild = path.join(__dirname, '..', '..', 'client', 'build');
  if (fs.existsSync(clientBuild)) {
    app.use(express.static(clientBuild));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientBuild, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

const app = createApp();
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, process.env.HOST || '0.0.0.0', () => console.log(`ABQ ADU server on :${PORT}`));
}

module.exports = app;
module.exports.createApp = createApp;
