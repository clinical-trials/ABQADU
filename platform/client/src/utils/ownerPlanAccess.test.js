import { requestJson } from './api';
import { clearAuthSession, getAuthSession, setAuthSession } from './authFetch';

let originalFetch;
beforeEach(() => { originalFetch = global.fetch; });
afterEach(() => { clearAuthSession(); global.fetch = originalFetch; });

test('concealed owner-plan denial leaves an approved staff session usable for company requests', async () => {
  const onUnauthorized = jest.fn();
  const staff = setAuthSession({
    userId: 'fictional-staff', sessionId: 'fictional-session',
    getToken: async () => 'fictional-staff-token', onUnauthorized,
  });
  global.fetch = jest.fn(async (url, options) => {
    expect(options.headers.get('Authorization')).toBe('Bearer fictional-staff-token');
    if (url === '/api/executive/owner-plan') {
      return new Response(JSON.stringify({ error: 'Owner plan is not available.' }), {
        status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
      });
    }
    if (url === '/api/executive/cfo/briefing') {
      return new Response(JSON.stringify({ headline: 'Fictional company review' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected test request');
  });

  await expect(requestJson('/api/executive/owner-plan', { authSession: staff }))
    .rejects.toMatchObject({ status: 404, message: 'Owner plan is not available.' });
  expect(getAuthSession()).toBe(staff);
  expect(onUnauthorized).not.toHaveBeenCalled();
  await expect(requestJson('/api/executive/cfo/briefing', { authSession: staff }))
    .resolves.toEqual({ headline: 'Fictional company review' });
  expect(getAuthSession()).toBe(staff);
});
