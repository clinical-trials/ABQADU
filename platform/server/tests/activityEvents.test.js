const { deriveActivityEvents } = require('../src/services/activityEvents');
const project = { id: 'fixture-job', site_visit_status: 'Scheduled', engineering_status: 'Needs engineering', bid_total: 125000, next_action: 'Review plans.' };
const change = patch => deriveActivityEvents({ projects: [project] }, { projects: [{ ...project, ...patch }] });

test('project summaries identify changed fields and include safe status and estimate values', () => {
  const events = change({ site_visit_status: 'Completed', engineering_status: 'In review', bid_total: 145000, next_action: 'Call 505-555-0123 about 123 Private Street.' });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: 'project.updated', changed_fields: expect.arrayContaining(['site_visit_status', 'engineering_status', 'bid_total', 'next_action']) });
  expect(events[0].summary).toMatch(/site visit.*Completed/);
  expect(events[0].summary).toMatch(/engineering.*In review/);
  expect(events[0].summary).toContain('$145,000');
  expect(events[0].summary).toMatch(/next action/);
  expect(events[0].summary).not.toMatch(/505|Private Street/);
});

test('contact, location and arbitrary text values never enter project summaries', () => {
  const events = change({ client: 'Private Person', client_phone: '5055550123', client_email: 'private@example.test', address: '987 Hidden Street', status: 'Paid by Private Person', internal_notes: 'sk_test_private' });
  expect(events[0].changed_fields).toEqual(expect.arrayContaining(['client', 'client_phone', 'client_email', 'address', 'status']));
  expect(events[0].summary).toMatch(/contact|client|location/i);
  expect(events[0].summary).not.toMatch(/Private Person|5055550123|private@|987 Hidden|Paid|sk_test/i);
});

test('invoice preparation cannot swallow a simultaneous site or price edit', () => {
  const events = change({ invoice_drafts: [{ id: 'draft-1', amount: 10000 }], draw_schedule: [{ amount: 10000 }], site_visit_status: 'Completed', bid_total: 150000 });
  expect(events.map(event => event.type)).toEqual(['invoice_drafts.prepared', 'project.updated']);
  expect(events[1].changed_fields).toEqual(expect.arrayContaining(['site_visit_status', 'bid_total']));
  expect(events[1].changed_fields).not.toContain('invoice_drafts');
  expect(events[1].summary).toContain('$150,000');
  expect(events.map(event => event.summary).join(' ')).not.toMatch(/paid|sent|delivered/i);
});

test('derived readiness changes do not manufacture another saved-project event', () => {
  expect(change({ readiness_label: 'Ready to send', metrics: { gross_profit: 1200 } })).toEqual([]);
});

test('supplier updates retain accompanying project edits in their summary and metadata', () => {
  const events = deriveActivityEvents({ projects: [project] }, {
    projects: [{ ...project, cogs_low: 98000, site_visit_status: 'Completed' }],
    estimate_sections: [{ project_id: project.id, section: 'Supplier COGS', subtotal: 98000, items: [] }],
  });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: 'supplier.cogs_updated', changed_fields: expect.arrayContaining(['cogs_low', 'site_visit_status']) });
  expect(events[0].summary).toMatch(/site visit.*Completed/);
});
