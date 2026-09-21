// Test fixtures only. Runtime transport always starts with no authenticated session.
import 'whatwg-fetch';
import { act } from 'react';
import { clearAuthSession, setAuthSession } from './utils/authFetch';

beforeEach(() => {
  setAuthSession({ userId: 'test-staff', sessionId: 'test-session', getToken: async () => 'test-token' });
});
afterEach(() => { act(() => clearAuthSession()); });
