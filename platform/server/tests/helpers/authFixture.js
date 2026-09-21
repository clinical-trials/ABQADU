const { generateKeyPairSync, sign } = require('node:crypto');

// Ephemeral test keys exercise Clerk's real signature verifier without a provider call.
function createAuthFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const origin = 'https://builder.example.test';
  const issuer = 'https://test-workspace.clerk.accounts.dev';
  const env = {
    CLERK_TELEMETRY_DISABLED: '1',
    CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('test-workspace.clerk.accounts.dev$').toString('base64')}`,
    CLERK_SECRET_KEY: 'sk_test_test_fixture_only',
    CLERK_ALLOWED_USER_IDS: 'user_allowed',
    CLERK_JWT_KEY: publicKey.export({ type: 'spki', format: 'pem' }),
    APP_ORIGINS: origin,
  };
  function token(claims = {}, header = {}, signingKey = privateKey) {
    const now = Math.floor(Date.now() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const data = `${encode({ alg: 'RS256', typ: 'JWT', kid: 'test-key', ...header })}.${encode({
      sub: 'user_allowed', sid: 'sess_fixture', iss: issuer, azp: origin,
      iat: now - 5, nbf: now - 5, exp: now + 300, ...claims,
    })}`;
    return `${data}.${sign('RSA-SHA256', Buffer.from(data), signingKey).toString('base64url')}`;
  }
  return { env, origin, token };
}

module.exports = { createAuthFixture };
