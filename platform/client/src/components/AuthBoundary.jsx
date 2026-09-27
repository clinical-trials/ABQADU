import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { ClerkProvider, SignIn, useAuth, useClerk } from '@clerk/react';
import { apiFetch, assertAuthSession, clearAuthSession, getAuthSession, setAuthSession, subscribeAuthSession } from '../utils/authFetch';
import './AuthBoundary.css';

const SignOutContext = createContext(null);

function AuthScreen({ title, children }) {
  return <main className="auth-screen"><section className="auth-card">
    <div className="auth-brand">ABQ <span>ADU</span></div>
    <p className="auth-eyebrow">Private builder workspace</p>
    <h1>{title}</h1>{children}
    <aside className="auth-public-access" aria-label="Homeowner access">
      <h2>Here for your home?</h2>
      <p>No account needed to explore ADU models, find stucco, yardwork or house cleaning, and prepare a quote request.</p>
      <nav className="auth-public-links" aria-label="Homeowner website">
        <a className="auth-home-link" href="/">Open homeowner website</a>
        <a href="/#contractors">Find a local trade</a>
      </nav>
    </aside>
  </section></main>;
}

export function WorkspaceSignOut() {
  const signOut = useContext(SignOutContext);
  return signOut ? <button className="workspace-signout" onClick={signOut}>Sign out</button> : null;
}

async function revokeLocalSession(token) {
  try {
    await fetch('/api/auth/local-session', {
      method: 'DELETE', credentials: 'omit', redirect: 'error', mode: 'same-origin', keepalive: true,
      headers: { Authorization: `Bearer ${token}`, 'X-ABQ-Local-Access': '1' },
    });
  } catch { /* The browser still closes immediately; server sessions also expire. */ }
}

function LocalWorkspace({ children }) {
  const live = useSyncExternalStore(subscribeAuthSession, getAuthSession);
  const [attempt, setAttempt] = useState(0);
  const [closed, setClosed] = useState(false);
  const [decision, setDecision] = useState({ kind: 'checking' });

  useEffect(() => {
    if (closed) return undefined;
    let cancelled = false, owner, token, revoked = false;
    const controller = new AbortController();
    const revoke = () => {
      if (token && !revoked) { revoked = true; void revokeLocalSession(token); }
    };
    const leavePage = () => {
      cancelled = true;
      controller.abort();
      if (owner) clearAuthSession(owner);
      revoke();
      // A page restored from the back/forward cache must not reuse a revoked session.
      setClosed(true);
      setDecision({ kind: 'closed' });
    };
    window.addEventListener('pagehide', leavePage);
    clearAuthSession();
    setDecision({ kind: 'checking' });
    (async () => {
      try {
        const response = await fetch('/api/auth/local-session', {
          method: 'POST', credentials: 'omit', redirect: 'error', mode: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-ABQ-Local-Access': '1' },
          body: '{}', signal: controller.signal,
        });
        if (!response.ok) throw new Error('Local session unavailable');
        const payload = await response.json();
        if (typeof payload.token === 'string' && payload.token.length >= 32) token = payload.token;
        if (cancelled) { revoke(); return; }
        if (!token || payload.userId !== 'local-owner' || typeof payload.sessionId !== 'string' || !payload.sessionId) {
          throw new Error('Invalid local session');
        }
        owner = setAuthSession({
          userId: payload.userId, sessionId: payload.sessionId, getToken: async () => token,
          onUnauthorized: () => { if (!cancelled) setDecision({ kind: 'expired' }); },
        });
        const verified = await apiFetch('/api/auth/session', { authSession: owner });
        if (!verified.ok) throw new Error('Local access unavailable');
        const identity = await verified.json();
        assertAuthSession(owner);
        if (identity.userId !== payload.userId) throw new Error('Local identity mismatch');
        if (!cancelled) setDecision({ kind: 'allowed', owner });
      } catch {
        if (owner) clearAuthSession(owner);
        revoke();
        if (!cancelled) setDecision({ kind: 'error' });
      }
    })();
    return () => {
      window.removeEventListener('pagehide', leavePage);
      cancelled = true; controller.abort(); if (owner) clearAuthSession(owner); revoke();
    };
  }, [attempt, closed]);

  const close = () => {
    clearAuthSession(decision.owner);
    setClosed(true);
    setDecision({ kind: 'closed' });
  };
  const reopen = () => { setClosed(false); setAttempt(value => value + 1); };
  if (decision.kind === 'allowed' && decision.owner.epoch === live.epoch) {
    return <SignOutContext.Provider value={close}>
      <aside className="local-workspace-banner" aria-label="Local development workspace">
        <div><strong>Local workspace</strong><span>Saved project data · this Mac only</span></div>
        <button onClick={close}>Close workspace</button>
      </aside>
      <React.Fragment key={live.epoch}>{children}</React.Fragment>
    </SignOutContext.Provider>;
  }
  if (decision.kind === 'checking') return <AuthScreen title="Opening your local workspace…"><p role="status">Connecting to your saved projects on this Mac.</p></AuthScreen>;
  return <AuthScreen title={decision.kind === 'error' ? 'Unable to open local workspace' : 'Local workspace closed'}>
    <p>This development workspace trusts access from this Mac. Reopen it here to continue, or restart the local server if it is unavailable.</p>
    <button onClick={reopen}>Reopen local workspace</button>
  </AuthScreen>;
}

function AuthorizedWorkspace({ children }) {
  const { isLoaded, isSignedIn, userId, sessionId, getToken } = useAuth();
  const clerk = useClerk();
  const live = useSyncExternalStore(subscribeAuthSession, getAuthSession);
  const [attempt, setAttempt] = useState(0);
  const [decision, setDecision] = useState(null);
  const identity = `${userId || ''}:${sessionId || ''}`;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId || !sessionId) {
      clearAuthSession();
      setDecision(null);
      return undefined;
    }
    let cancelled = false;
    const checkProviderIdentity = () => {
      // Clerk's getToken follows its active session, which can change before React re-renders.
      if (clerk.session?.id !== sessionId || clerk.user?.id !== userId) clearAuthSession(owner);
      assertAuthSession(owner);
    };
    const owner = setAuthSession({
      userId, sessionId, getToken: async () => {
        checkProviderIdentity();
        const token = await getToken();
        checkProviderIdentity();
        return token;
      },
      onUnauthorized: status => {
        if (!cancelled) setDecision({ identity, kind: status === 403 ? 'denied' : 'expired' });
      },
    });
    setDecision({ identity, kind: 'checking' });
    (async () => {
      try {
        const response = await apiFetch('/api/auth/session', { authSession: owner });
        if (!response.ok) throw new Error('Authorization is temporarily unavailable.');
        const payload = await response.json();
        assertAuthSession(owner);
        if (payload?.userId !== userId) throw new Error('Authorization could not confirm this account.');
        if (!cancelled) setDecision({ identity, kind: 'allowed', owner });
      } catch (error) {
        if (!cancelled) {
          clearAuthSession(owner);
          setDecision({ identity, kind: error.status === 403 ? 'denied' : error.status === 401 ? 'expired' : 'error' });
        }
      }
    })();
    return () => { cancelled = true; clearAuthSession(owner); };
  }, [isLoaded, isSignedIn, userId, sessionId, identity, attempt, clerk, getToken]);

  const signOut = async () => {
    clearAuthSession();
    setDecision({ identity, kind: 'signing-out' });
    try { await clerk.signOut(); }
    catch { setDecision({ identity, kind: 'expired' }); }
  };

  if (!isLoaded) return <AuthScreen title="Checking sign-in…"><p role="status">Your workspace remains locked while sign-in loads.</p></AuthScreen>;
  if (!isSignedIn) return <AuthScreen title="Sign in to your workspace"><p>Only approved staff accounts can access project and billing records.</p><SignIn routing="hash" withSignUp={false} forceRedirectUrl={window.location.pathname} /></AuthScreen>;
  const current = decision?.identity === identity ? decision : null;
  if (current?.kind === 'allowed' && current.owner.epoch === live.epoch) {
    return <SignOutContext.Provider value={signOut}><React.Fragment key={live.epoch}>{children}</React.Fragment></SignOutContext.Provider>;
  }
  if (current?.kind === 'denied') return <AuthScreen title="No workspace access"><p>This account is signed in but is not approved for this private workspace. Ask the workspace owner for access.</p><button onClick={signOut}>Sign out</button></AuthScreen>;
  if (current?.kind === 'expired' || current?.kind === 'error' || (current?.kind === 'allowed' && !live.userId)) {
    return <AuthScreen title={current.kind === 'error' ? 'Unable to verify workspace access' : 'Session ended'}><p>Project data is locked. Check your connection and sign-in before continuing.</p><div className="auth-actions"><button onClick={() => setAttempt(value => value + 1)}>Retry</button><button onClick={signOut}>Sign out</button></div></AuthScreen>;
  }
  return <AuthScreen title={current?.kind === 'signing-out' ? 'Signing out…' : 'Checking workspace access…'}><p role="status">Confirming access with the server.</p></AuthScreen>;
}

class ProviderBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { clearAuthSession(); }
  render() {
    return this.state.failed ? <AuthScreen title="Workspace setup required"><p>Sign-in configuration could not load. Contact the workspace owner to check the server authentication settings.</p></AuthScreen> : this.props.children;
  }
}

export default function AuthBoundary({ children }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    clearAuthSession(); setError(false); setConfig(null);
    (async () => {
      try {
        const response = await fetch('/api/auth/config', { credentials: 'omit', redirect: 'error', signal: controller.signal });
        if (!response.ok) throw new Error('Configuration unavailable');
        const payload = await response.json();
        if (!cancelled) setConfig(payload);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; controller.abort(); clearAuthSession(); };
  }, [attempt]);

  if (error) return <AuthScreen title="Unable to check workspace setup"><p>The server is unavailable. Your project data remains locked.</p><button onClick={() => setAttempt(value => value + 1)}>Retry</button></AuthScreen>;
  if (!config) return <AuthScreen title="Checking workspace setup…"><p role="status">Connecting to the server.</p></AuthScreen>;
  if (config.configured === true && config.mode === 'local') return <LocalWorkspace>{children}</LocalWorkspace>;
  if (config.configured !== true || typeof config.publishableKey !== 'string' || !/^pk_(test|live)_/.test(config.publishableKey)) {
    return <AuthScreen title="Workspace setup required"><p>Builder sign-in is not ready on this server. The homeowner website is open; signing in is only needed for saved projects and billing.</p><details className="auth-owner-setup"><summary>Set up builder access</summary><p>The workspace owner needs to add the existing Clerk application keys and approved staff IDs to the private server configuration, then restart the app. Payment and texting setup can follow separately.</p></details><button onClick={() => setAttempt(value => value + 1)}>Retry setup check</button></AuthScreen>;
  }
  return <ProviderBoundary><ClerkProvider publishableKey={config.publishableKey}><AuthorizedWorkspace>{children}</AuthorizedWorkspace></ClerkProvider></ProviderBoundary>;
}
