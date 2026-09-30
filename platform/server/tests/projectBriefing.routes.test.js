const { createProjectBriefingRouter } = require('../src/routes/projectBriefing');

async function invoke(getBriefing, query = {}) {
  const router = createProjectBriefingRouter({ getBriefing });
  const handler = router.stack.find(layer => layer.route?.path === '/projects/:projectId/briefing').route.stack[0].handle;
  const res = { set: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  await handler({ params: { projectId: 'saved-job' }, query }, res, jest.fn());
  return res;
}

test('briefing route forwards only the explicit schedule selection and prevents caching', async () => {
  const getBriefing = jest.fn(async () => ({ headline: 'Review the work' }));
  const res = await invoke(getBriefing, { trade: 'roofing', schedule_project_id: '17' });
  expect(getBriefing).toHaveBeenCalledWith('saved-job', { trade: 'roofing', scheduleProjectId: '17' });
  expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  expect(res.json).toHaveBeenCalledWith({ headline: 'Review the work' });
});

test.each([400, 404, 503])('briefing route returns expected %s validation or availability responses', async status => {
  const res = await invoke(async () => { throw Object.assign(new Error('Expected public message'), { status }); });
  expect(res.status).toHaveBeenCalledWith(status);
  expect(res.json).toHaveBeenCalledWith({ error: 'Expected public message' });
});

test('unexpected errors cannot expose infrastructure details even with a status property', async () => {
  const res = await invoke(async () => { throw Object.assign(new Error('Private infrastructure details'), { status: 500 }); });
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({ error: 'Project briefing is temporarily unavailable.' });
});
