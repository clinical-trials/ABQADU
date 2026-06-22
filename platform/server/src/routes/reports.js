const router = require('express').Router();
const puppeteer = require('puppeteer');
const { pool } = require('../db');

router.post('/generate', async (req, res) => {
  const { project_id, report_type = 'executive' } = req.body;

  const [projRes, actRes, riskRes] = await Promise.all([
    pool.query('SELECT * FROM projects WHERE id=$1', [project_id]),
    pool.query(
      `SELECT name, planned_start, planned_finish, pct_complete, is_critical, total_float
       FROM activities WHERE project_id=$1 ORDER BY sort_order`,
      [project_id]
    ),
    pool.query(
      `SELECT title, category, probability, impact, risk_score, status, mitigation_plan
       FROM risks WHERE project_id=$1 ORDER BY risk_score DESC NULLS LAST`,
      [project_id]
    ),
  ]);

  if (!projRes.rows.length) return res.status(404).json({ error: 'Project not found' });
  const project = projRes.rows[0];
  const activities = actRes.rows;
  const risks = riskRes.rows;

  const totalActs = activities.length;
  const criticalActs = activities.filter(a => a.is_critical).length;
  const avgComplete = totalActs
    ? Math.round(activities.reduce((s, a) => s + parseFloat(a.pct_complete || 0), 0) / totalActs)
    : 0;
  const highRisks = risks.filter(r => r.risk_score >= 15).length;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Helvetica Neue', sans-serif; color: #1C1917; margin: 0; padding: 40px 56px; font-size: 13px; }
  .header { border-bottom: 3px solid #C4954A; padding-bottom: 20px; margin-bottom: 32px; display: flex; justify-content: space-between; align-items: flex-end; }
  .logo { font-size: 22px; font-weight: 900; letter-spacing: -.01em; color: #1C1917; }
  .logo span { color: #C4954A; }
  .report-meta { text-align: right; font-size: 11px; color: #78716C; }
  h2 { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #C4954A; margin: 32px 0 10px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
  .kpi { background: #F5F0E8; border-radius: 6px; padding: 16px; }
  .kpi-num { font-size: 32px; font-weight: 900; line-height: 1; color: #1C1917; }
  .kpi-num.green { color: #3D5247; }
  .kpi-num.red { color: #B85C38; }
  .kpi-label { font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: #78716C; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #F5F0E8; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #78716C; }
  td { padding: 9px 10px; border-bottom: 1px solid #E7E0D5; }
  .critical { color: #B85C38; font-weight: 600; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; }
  .pill.red { background: #FEE2E2; color: #B91C1C; }
  .pill.yellow { background: #FEF3C7; color: #92400E; }
  .pill.green { background: #D1FAE5; color: #065F46; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #E7E0D5; font-size: 10px; color: #A8A29E; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">ABQ <span>ADU</span></div>
    <div style="font-size:13px;color:#78716C;margin-top:4px;">Executive Project Report</div>
  </div>
  <div class="report-meta">
    <div><strong>${project.name}</strong></div>
    <div>Generated ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</div>
  </div>
</div>

<div class="kpi-grid">
  <div class="kpi"><div class="kpi-num ${avgComplete >= 80 ? 'green' : avgComplete < 40 ? 'red' : ''}">${avgComplete}%</div><div class="kpi-label">Overall Complete</div></div>
  <div class="kpi"><div class="kpi-num">${totalActs}</div><div class="kpi-label">Total Activities</div></div>
  <div class="kpi"><div class="kpi-num red">${criticalActs}</div><div class="kpi-label">Critical Activities</div></div>
  <div class="kpi"><div class="kpi-num ${highRisks > 0 ? 'red' : 'green'}">${highRisks}</div><div class="kpi-label">High Risks</div></div>
</div>

<h2>Schedule Overview</h2>
<table>
  <thead><tr><th>Activity</th><th>Start</th><th>Finish</th><th>% Complete</th><th>Float (days)</th><th>Critical</th></tr></thead>
  <tbody>
    ${activities.map(a => `
    <tr>
      <td ${a.is_critical ? 'class="critical"' : ''}>${a.name}</td>
      <td>${a.planned_start || '—'}</td>
      <td>${a.planned_finish || '—'}</td>
      <td>${a.pct_complete || 0}%</td>
      <td>${a.total_float != null ? a.total_float : '—'}</td>
      <td>${a.is_critical ? '<span class="pill red">Critical</span>' : ''}</td>
    </tr>`).join('')}
  </tbody>
</table>

${risks.length ? `
<h2>Risk Register</h2>
<table>
  <thead><tr><th>Risk</th><th>Category</th><th>Score</th><th>Status</th><th>Mitigation</th></tr></thead>
  <tbody>
    ${risks.map(r => `
    <tr>
      <td>${r.title}</td>
      <td>${r.category || '—'}</td>
      <td>${r.risk_score || '—'}</td>
      <td><span class="pill ${r.status === 'open' ? (r.risk_score >= 15 ? 'red' : 'yellow') : 'green'}">${r.status}</span></td>
      <td>${r.mitigation_plan || '—'}</td>
    </tr>`).join('')}
  </tbody>
</table>` : ''}

<footer>
  <span>ABQ ADU Platform — Confidential</span>
  <span>${project.name} · ${new Date().getFullYear()}</span>
</footer>
</body>
</html>`;

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'Letter', margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  await browser.close();

  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${project.name}-report.pdf"` });
  res.send(pdf);
});

module.exports = router;
