const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');

const derive = promisify(scrypt);
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest();
const loopback = value => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value);
const defaultCredentialFile = path.join(__dirname, '../data/admin-auth.json');

async function createAdminCredential(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256
    || Buffer.byteLength(password) > 1024 || /[\u0000-\u001f\u007f]/.test(password)) {
    throw new Error('Use a password of 12–256 characters without control characters.');
  }
  const salt = randomBytes(32);
  const passwordHash = await derive(password, salt, 64, SCRYPT);
  return { version: 1, username: 'admin', kdf: 'scrypt-v1', salt: salt.toString('hex'), passwordHash: passwordHash.toString('hex') };
}

function readCredential(file) {
  let descriptor;
  try {
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o077)
      || (process.getuid && stat.uid !== process.getuid())) return null;
    const bytes = Buffer.alloc(4097);
    const size = fs.readSync(descriptor, bytes, 0, bytes.length, 0);
    if (size > 4096) return null;
    const value = JSON.parse(bytes.subarray(0, size).toString('utf8'));
    if (value.version !== 1 || value.username !== 'admin' || value.kdf !== 'scrypt-v1'
      || !/^[a-f0-9]{64}$/.test(value.salt) || !/^[a-f0-9]{128}$/.test(value.passwordHash)) return null;
    return value;
  } catch { return null; }
  finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

function readConfig(env) {
  const origins = String(env.APP_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  let valid = false;
  try {
    valid = origins.length > 0 && origins.every(origin => {
      const url = new URL(origin);
      return url.origin === origin && !url.username && !url.password
        && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
    });
  } catch { valid = false; }
  const credential = env.ABQ_AUTH_MODE === 'admin' && valid ? readCredential(env.ABQ_ADMIN_CREDENTIAL_FILE || defaultCredentialFile) : null;
  return { origins: valid ? origins : [], credential, configured: Boolean(credential), trustLoopbackProxy: env.ABQ_ADMIN_TRUST_PROXY === 'loopback' };
}

function getAdminAuthStatus(env = process.env) {
  return { mode: 'admin', configured: readConfig(env).configured };
}

function createAdminWorkspaceAuth(env = process.env) {
  const config = readConfig(env);
  const sessions = new Map(), failures = new Map();
  let globalWindow = { count: 0, until: 0 }, activeChecks = 0;
  const unavailable = (_req, res) => res.set('Cache-Control', 'no-store').status(404).json({ error: 'Local workspace access is not enabled.' });
  const publicConfig = (_req, res) => res.set('Cache-Control', 'no-store').json({ mode: 'admin', configured: config.configured, publishableKey: null });

  function checkOrigin(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (!config.configured) return res.status(503).json({ error: 'Workspace sign-in is not configured.' });
    const peer = req.socket.remoteAddress;
    const tls = Boolean(req.socket.encrypted) || (config.trustLoopbackProxy && loopback(peer) && req.headers['x-forwarded-proto'] === 'https');
    const requestOrigin = `${tls ? 'https' : 'http'}://${req.headers.host || ''}`;
    if (!config.origins.includes(requestOrigin) || (!tls && !loopback(peer))
      || (req.headers.origin !== undefined && req.headers.origin !== requestOrigin)
      || (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) {
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    }
    next();
  }

  function prepareAdminLogin(req, res, next) {
    checkOrigin(req, res, () => {
      if (!req.headers.origin) return res.status(403).json({ error: 'Request origin is not allowed.' });
      if (!req.is('application/json')) return res.status(415).json({ error: 'Sign-in requires JSON.' });
      next();
    });
  }

  function clean(now) {
    for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
    for (const [key, value] of failures) if (value.until <= now) failures.delete(key);
    if (globalWindow.until <= now) globalWindow = { count: 0, until: now + WINDOW_MS };
  }
  function throttle(res, until) {
    return res.set('Retry-After', String(Math.max(1, Math.ceil((until - Date.now()) / 1000))))
      .status(429).json({ error: 'Too many sign-in attempts. Wait before trying again.' });
  }
  async function createAdminSession(req, res) {
    const body = req.body;
    if (!body || Array.isArray(body) || Object.keys(body).some(key => !['username', 'password'].includes(key))
      || typeof body.username !== 'string' || body.username.length > 128 || typeof body.password !== 'string'
      || body.password.length > 256 || Buffer.byteLength(body.password) > 1024) {
      return res.status(400).json({ error: 'Enter your username and password.' });
    }
    const now = Date.now(); clean(now);
    const key = req.socket.remoteAddress;
    const window = failures.get(key) || { count: 0, until: now + WINDOW_MS };
    if (window.count >= 5) return throttle(res, window.until);
    if (globalWindow.count >= 50 || (!failures.has(key) && failures.size >= 1024)) return throttle(res, globalWindow.until);
    if (activeChecks >= 2) return throttle(res, now + 1000);
    // Reserve before awaiting scrypt so concurrent attempts cannot bypass limits.
    failures.set(key, window); window.count += 1; globalWindow.count += 1; activeChecks += 1;
    const reservedGlobalWindow = globalWindow;
    try {
      const actual = await derive(body.password, Buffer.from(config.credential.salt, 'hex'), 64, SCRYPT);
      const validPassword = timingSafeEqual(actual, Buffer.from(config.credential.passwordHash, 'hex'));
      const validUsername = timingSafeEqual(hash(body.username), hash('admin'));
      if (!validPassword || !validUsername) return res.status(401).json({ error: 'Username or password is incorrect.' });
      // Remove only this successful attempt; retain previous failures and concurrent attempts.
      window.count = Math.max(0, window.count - 1);
      reservedGlobalWindow.count = Math.max(0, reservedGlobalWindow.count - 1);
      const token = randomBytes(32).toString('base64url'), sessionId = randomBytes(24).toString('base64url');
      const expires = Date.now() + SESSION_MS;
      clean(Date.now());
      if (sessions.size >= 64) sessions.delete(sessions.keys().next().value);
      sessions.set(hash(token).toString('hex'), { sessionId, expires });
      return res.status(201).json({ userId: 'admin-owner', sessionId, token, expiresAt: new Date(expires).toISOString() });
    } catch {
      return res.status(503).json({ error: 'Sign-in is temporarily unavailable.' });
    } finally { activeChecks -= 1; }
  }

  function requireSession(req, res, next) {
    const token = (req.headers.authorization || '').match(/^Bearer ([A-Za-z0-9_-]{43})$/i)?.[1];
    clean(Date.now());
    const digest = token ? hash(token).toString('hex') : null;
    const session = digest && sessions.get(digest);
    if (!session) return res.status(401).json({ error: 'Your session is invalid or expired. Sign in again.' });
    sessions.delete(digest); sessions.set(digest, session);
    req.workspaceAuth = { userId: 'admin-owner', sessionId: session.sessionId, mode: 'admin' };
    next();
  }
  function revokeAdminSession(req, res) {
    for (const [key, session] of sessions) if (session.sessionId === req.workspaceAuth.sessionId) sessions.delete(key);
    res.status(204).end();
  }
  return { publicConfig, checkOrigin, prepareAdminLogin, createAdminSession, requireSession, revokeAdminSession,
    createLocalSession: unavailable, revokeLocalSession: unavailable, origins: config.origins };
}

module.exports = { createAdminCredential, getAdminAuthStatus, createAdminWorkspaceAuth, defaultCredentialFile };
