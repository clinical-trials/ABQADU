const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const GRID = 12;

function describeRooms(rooms) {
  return rooms.map(r => {
    const w = Math.round(r.w / GRID);
    const h = Math.round(r.h / GRID);
    return `${r.label} (${r.type}): ${w}×${h} ft = ${w * h} sf`;
  }).join('\n');
}

async function generateDesignBrief(rooms, templateName, projectInfo) {
  const totalSf = rooms.reduce((s, r) => s + (r.w / GRID) * (r.h / GRID), 0);
  const prompt = `You are an ADU design consultant for ABQ ADU, a construction company in Albuquerque, NM.

A client has configured a floor plan with the following rooms:
${describeRooms(rooms)}

Template: ${templateName || 'Custom'}
Total: ${Math.round(totalSf)} sf
Project: ${projectInfo?.name || 'New ADU'}

Write a concise design brief (3–4 paragraphs) that:
1. Describes the layout's strengths and how the spaces flow
2. Notes any design considerations or potential improvements
3. Highlights how the design suits Albuquerque's climate and lifestyle
4. Suggests one signature design feature (e.g., portal porch, vigas, Saltillo tile)

Keep it professional but approachable — this will be shared with the homeowner.`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text;
}

async function analyzeCompliance(rooms, totalSqft) {
  const prompt = `You are a building code specialist familiar with Albuquerque, NM zoning and the International Residential Code (IRC).

Review this ADU floor plan against ABQ IDO §14-16-6-7 and IRC requirements:

Rooms:
${describeRooms(rooms)}
Total: ${Math.round(totalSqft)} sf

Check for compliance with:
- ABQ ADU maximum 1,000 sf
- Minimum bedroom size: 70 sf (IRC R304.1)
- Minimum habitable room size: 120 sf (IRC R304.1)
- Minimum horizontal dimension: 7 ft (IRC R304.2)
- Bedroom egress requirements (IRC R310)
- Bathroom requirement for sleeping units

Respond in this format:
COMPLIANT: [Yes/No/Conditional]
ISSUES:
- [list any code issues]
RECOMMENDATIONS:
- [list any suggestions]
NOTES: [any general observations]`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text;
}

async function generatePermitNarrative(rooms, templateName, projectInfo) {
  const totalSf = rooms.reduce((s, r) => s + (r.w / GRID) * (r.h / GRID), 0);
  const bedrooms = rooms.filter(r => r.type === 'bedroom').length;
  const bathrooms = rooms.filter(r => r.type === 'bathroom').length;

  const prompt = `You are a permit expediter preparing a project narrative for the City of Albuquerque Planning Department.

Write a formal project narrative for an ADU permit application with these details:

Project: ${projectInfo?.name || 'Accessory Dwelling Unit'}
Address: ${projectInfo?.address || '[Property Address]'}
Template: ${templateName || 'Custom ADU'}
Total Area: ${Math.round(totalSf)} sf
Bedrooms: ${bedrooms}
Bathrooms: ${bathrooms}

Room breakdown:
${describeRooms(rooms)}

The narrative should:
1. Describe the scope of work (new detached ADU)
2. Reference compliance with ABQ IDO §14-16-6-7 (ADU regulations)
3. State conformance with IRC for residential construction
4. Note energy compliance (2021 IECC)
5. Describe the construction type and materials (wood frame, stucco exterior)

Keep it formal and concise — 2–3 paragraphs suitable for a permit submittal.`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text;
}

module.exports = { generateDesignBrief, analyzeCompliance, generatePermitNarrative };
