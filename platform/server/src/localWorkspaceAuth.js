const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_SESSIONS = 64;

function validateLocalEnvironment(env) {
  if (env.ABQ_LOCAL_WORKSPACE === '1'
    && (env.NODE_ENV !== 'development' || env.HOST !== '127.0.0.1')) {
    throw new Error('Local workspace access requires NODE_ENV=development and HOST=127.0.0.1. Use npm run local.');
  }
}

function isDirectLocalRequest(req) {
  // Read the physical socket and raw authority; proxy metadata is never trusted.
  const { remoteAddress, localPort } = req.socket || {};
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress)
    || !Number.isInteger(localPort) || localPort < 1 || localPort > 65535) return false;
  const authorities = [`127.0.0.1:${localPort}`, `localhost:${localPort}`];
  if (localPort === 80) authorities.push('127.0.0.1', 'localhost');
  if (!authorities.includes(req.headers.host)) return false;
  if (Object.keys(req.headers).some(header => header === 'forwarded' || header === 'x-real-ip' || header.startsWith('x-forwarded-'))) return false;
  if (req.headers.origin !== undefined && req.headers.origin !== `http://${req.headers.host}`) return false;
  if (req.headers['sec-fetch-site'] !== undefined
    && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return false;
  return true;
}

function createLocalWorkspaceAuth(env) {
  validateLocalEnvironment(env);
  // Store only digests; capabilities live in browser memory and disappear on restart.
  const sessions = new Map();
  const digest = token => createHash('sha256').update(token).digest();

  function cleanup() {
    const now = Date.now();
    for (const [id, session] of sessions) if (session.expiresAt <= now) sessions.delete(id);
  }

  function checkOrigin(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (!isDirectLocalRequest(req)) {
      return res.status(403).json({ error: 'Local workspace access requires a direct, same-origin loopback connection.' });
    }
    return next();
  }

  function publicConfig(req, res) {
    return checkOrigin(req, res, () => res.json({ configured: true, mode: 'local', publishableKey: null }));
  }

  function createLocalSession(req, res) {
    return checkOrigin(req, res, () => {
      if (req.headers['x-abq-local-access'] !== '1') {
        return res.status(403).json({ error: 'Explicit local workspace entry is required.' });
      }
      if (!req.is('application/json')) return res.status(415).json({ error: 'Local workspace entry requires application/json.' });
      cleanup();
      // Hard reloads can abandon capabilities; evict the least recently used
      // session so repeated reloads cannot prevent local entry for eight hours.
      if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
      const token = randomBytes(32).toString('base64url');
      const sessionId = randomBytes(24).toString('base64url');
      sessions.set(sessionId, { tokenDigest: digest(token), expiresAt: Date.now() + SESSION_TTL_MS });
      return res.status(201).json({ userId: 'local-owner', sessionId, token });
    });
  }

  function requireSession(req, res, next) {
    return checkOrigin(req, res, () => {
      cleanup();
      const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.headers.authorization || '');
      if (match) {
        const tokenDigest = digest(match[1]);
        for (const [sessionId, session] of sessions) {
          if (timingSafeEqual(tokenDigest, session.tokenDigest)) {
            // Map order records last use without extending the absolute expiry.
            sessions.delete(sessionId);
            sessions.set(sessionId, session);
            req.workspaceAuth = { userId: 'local-owner', sessionId };
            return next();
          }
        }
      }
      return res.status(401).json({ error: 'Your local workspace session is invalid or expired. Reopen the local workspace.' });
    });
  }

  function revokeLocalSession(req, res) {
    sessions.delete(req.workspaceAuth.sessionId);
    return res.status(204).end();
  }

  return { publicConfig, checkOrigin, requireSession, createLocalSession, revokeLocalSession, origins: [] };
}

module.exports = { createLocalWorkspaceAuth, validateLocalEnvironment };
