const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateDelayForecast(project, activities) {
  const critical = activities.filter(a => a.is_critical);
  const behind = activities.filter(a =>
    a.is_critical && a.planned_finish && new Date(a.planned_finish) < new Date() && !a.actual_finish
  );
  const avgSPI = activities.length
    ? activities.reduce((s, a) => s + (parseFloat(a.pct_complete) / 100 || 0), 0) / activities.length
    : 1;

  const prompt = `You are a construction project scheduler for ABQ ADU, a company that builds accessory dwelling units in Albuquerque, NM.

Project: ${project.name}
Total activities: ${activities.length}
Critical path activities: ${critical.length}
Activities behind on critical path: ${behind.length}
Average schedule performance index (SPI): ${avgSPI.toFixed(2)}
Behind-schedule activities: ${behind.map(a => `${a.name} (planned finish: ${a.planned_finish})`).join(', ') || 'None'}

Write a concise 2-3 paragraph executive summary of the schedule status. Include:
1. Overall health assessment (on track / at risk / delayed)
2. Specific delay risks and their impact on the completion date
3. One concrete recommended action to recover schedule

Write in plain English for a homeowner or executive audience. Be direct and specific.`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text;
}

async function analyzeRisks(project, risks) {
  if (!risks.length) return 'No risks currently logged for this project.';

  const top = risks.slice(0, 5);
  const prompt = `You are a construction risk analyst for ADU projects in Albuquerque, NM.

Project: ${project.name}
Top risks (scored probability × impact, max 25):
${top.map(r => `- ${r.title} | Score: ${r.risk_score} | Category: ${r.category || 'General'} | Status: ${r.status} | Mitigation: ${r.mitigation_plan || 'None defined'}`).join('\n')}

Provide a brief risk summary (2 paragraphs):
1. Which risks need immediate attention and why
2. One specific mitigation recommendation for the highest-scoring open risk

Be direct and actionable. Write for a general contractor audience.`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 350,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text;
}

async function generateWeeklyBriefing(project, activities, fieldTasks) {
  const thisWeekTasks = fieldTasks.filter(t => {
    const d = new Date(t.task_date);
    const now = new Date();
    const weekOut = new Date(now); weekOut.setDate(weekOut.getDate() + 7);
    return d >= now && d <= weekOut;
  });

  const prompt = `You are a project coordinator for ABQ ADU, an ADU construction company in Albuquerque, NM.

Project: ${project.name}
Activities in progress: ${activities.filter(a => a.pct_complete > 0 && a.pct_complete < 100).map(a => `${a.name} (${a.pct_complete}% complete)`).join(', ') || 'None'}
Field tasks scheduled this week: ${thisWeekTasks.map(t => `${t.task_date}: ${t.title} — ${t.resource_name || 'Unassigned'}`).join('; ') || 'None scheduled'}

Write a short weekly briefing (3-4 sentences) suitable for sending to the homeowner/client. Cover:
- What work is happening this week
- Current progress status
- What they should expect to see on site

Keep it friendly, specific, and jargon-free.`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 250,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text;
}

module.exports = { generateDelayForecast, analyzeRisks, generateWeeklyBriefing };
