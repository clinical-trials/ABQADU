const { createPublicKey } = require('node:crypto');
const { clerkMiddleware, getAuth } = require('@clerk/express');

const splitList = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);

function readAuthConfig(env) {
  const publishableKey = String(env.CLERK_PUBLISHABLE_KEY || '').trim();
  const secretKey = String(env.CLERK_SECRET_KEY || '').trim();
  const allowedUserIds = new Set(splitList(env.CLERK_ALLOWED_USER_IDS));
  const origins = splitList(env.APP_ORIGINS);
  const jwtKey = String(env.CLERK_JWT_KEY || '').replace(/\\n/g, '\n').trim();
  let issuer;
  let valid = false;
  try {
    // This is public configuration decoding, never session-token verification.
    const key = publishableKey.match(/^pk_(test|live)_([A-Za-z0-9+/=_-]+)$/);
    const encodedHost = key && Buffer.from(key[2], 'base64').toString('utf8');
    const host = encodedHost?.endsWith('$') ? encodedHost.slice(0, -1) : '';
    const issuerUrl = new URL(`https://${host}`);
    issuer = issuerUrl.origin;
    valid = Boolean(host && issuerUrl.host === host && issuerUrl.origin === `https://${host}`
      && !issuerUrl.username && !issuerUrl.password
      && secretKey.startsWith(`sk_${key[1]}_`) && secretKey.length > 12
      && allowedUserIds.size && [...allowedUserIds].every(id => /^user_[A-Za-z0-9]+$/.test(id))
      && origins.length && origins.every(origin => {
        const url = new URL(origin);
        const secure = url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname));
        return secure && url.origin === origin;
      }));
    if (jwtKey && createPublicKey(jwtKey).asymmetricKeyType !== 'rsa') valid = false;
  } catch {
    valid = false;
  }
  return { configured: valid, publishableKey, secretKey, allowedUserIds, origins, issuer, jwtKey };
}

function createWorkspaceAuth(env = process.env) {
  const config = readAuthConfig(env);
  const verify = config.configured ? clerkMiddleware({
    publishableKey: config.publishableKey,
    secretKey: config.secretKey,
    ...(config.jwtKey ? { jwtKey: config.jwtKey } : {}),
    authorizedParties: config.origins,
    acceptsToken: 'session_token',
  }) : null;

  function publicConfig(_req, res) {
    res.set('Cache-Control', 'no-store').json({
      configured: config.configured,
      publishableKey: config.configured ? config.publishableKey : null,
    });
  }

  function checkOrigin(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (!config.configured) {
      return res.status(503).json({ error: 'Workspace sign-in is not configured.' });
    }
    if (req.headers.origin && !config.origins.includes(req.headers.origin)) {
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    }
    next();
  }

  function requireSession(req, res, next) {
    // A cookie alone cannot authorize a business request or a cross-site write.
    if (!/^Bearer [^\s,]+$/i.test(req.headers.authorization || '')) {
      return res.status(401).json({ error: 'Sign in to access this workspace.' });
    }
    if (!verify) return res.status(503).json({ error: 'Workspace sign-in is not configured.' });
    return verify(req, res, error => {
      if (error) {
        console.error('Workspace session verification failed:', error.message);
        return res.status(503).json({ error: 'Sign-in verification is temporarily unavailable.' });
      }
      const auth = getAuth(req, { acceptsToken: 'session_token' });
      if (!auth.isAuthenticated || !auth.userId || !auth.sessionId
        || auth.sessionClaims?.iss !== config.issuer) {
        return res.status(401).json({ error: 'Your session is invalid or expired. Sign in again.' });
      }
      if (!config.allowedUserIds.has(auth.userId)) {
        return res.status(403).json({ error: 'This account does not have workspace access.' });
      }
      req.workspaceAuth = { userId: auth.userId, sessionId: auth.sessionId };
      next();
    });
  }

  return { publicConfig, checkOrigin, requireSession, origins: config.origins };
}

module.exports = { createWorkspaceAuth };
