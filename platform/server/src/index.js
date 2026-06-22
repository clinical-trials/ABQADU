require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

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

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`ABQ ADU server on :${PORT}`));

module.exports = app;
