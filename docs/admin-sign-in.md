# Admin sign-in

The contractor workspace supports one username/password owner account (`admin`), Clerk staff accounts, or the explicit local development mode. The homeowner website remains public. Admin mode gives its verified account access to private company and owner planning records; it is not a multi-user role system.

## Private setup

From `platform/server`, generate a unique password and write it to a private handoff file:

```sh
node scripts/setup-admin-auth.js --generate --handoff-file data/admin-login.txt
```

This creates `data/admin-auth.json` with a random salt and scrypt password hash, and `data/admin-login.txt` with the generated password. Both are mode `0600`; the existing Git ignore rule excludes the whole server data directory. Read the handoff privately, save the password in a password manager, and delete the handoff. Do not publish either file, include it in a public deployment artifact, or paste a password into chat or shell arguments. The command refuses to overwrite existing files. An operator can instead provide a JSON object containing only `password` through protected stdin using `--stdin`; passwords must be 12–256 characters. No shared default password exists.

Add these settings to the private server environment:

```dotenv
ABQ_AUTH_MODE=admin
APP_ORIGINS=http://localhost:4000,http://127.0.0.1:4000
```

The credential file defaults to `platform/server/data/admin-auth.json`; `ABQ_ADMIN_CREDENTIAL_FILE` can point to another private file. The server process must own it and group/other permissions must be disabled. Symlinks, invalid hashes, missing files, and invalid origins leave the workspace locked. Restart after creating or rotating a credential. Rotation can be prepared at a new private path with `--credential-file`, then selected through the environment and restarted; existing files are never silently replaced.

`ABQ_AUTH_MODE=admin` takes precedence over `ABQ_LOCAL_WORKSPACE=1`. `npm run local` retains explicit authentication modes and binds to loopback; it cannot bypass admin sign-in. To use Clerk, explicitly select `ABQ_AUTH_MODE=clerk` and configure the existing Clerk keys and user allowlist. Unknown authentication modes fail closed.

## Hosted transport

Hosted `APP_ORIGINS` must be exact HTTPS origins with no paths or wildcards. HTTP is accepted only for loopback origins and direct loopback connections. The request Host and Origin must match; cross-site browser metadata is rejected. The server does not trust forwarded IPs for throttling or arbitrary forwarded hosts.

When a TLS reverse proxy and Node run on the same machine, bind Node to `HOST=127.0.0.1`, configure the proxy to preserve the allowed Host and overwrite `X-Forwarded-Proto`, and set `ABQ_ADMIN_TRUST_PROXY=loopback`. Only a direct loopback peer with exactly `X-Forwarded-Proto: https` can use that option. Keep Node inaccessible externally. Other proxy topologies are not supported by this option. Without this explicit setting, forwarded TLS headers are ignored. This source change does not configure hosting or verify a deployed TLS proxy.

## Session behavior

`POST /api/auth/admin-session` requires same-origin JSON `{username,password}` and returns `{userId,sessionId,token,expiresAt}` after verification. The UI confirms the session with the protected API before mounting private records. Tokens remain in browser memory, are never stored in cookies or web storage, and expire absolutely after eight hours. Reloading requires another sign-in. Sign-out calls protected `DELETE /api/auth/admin-session`, clears browser state immediately, and revokes that token on the server. Page exit also attempts revocation; an unavailable connection can leave a server token valid until expiry or restart.

The server holds at most 64 sessions, invalidates all on restart, and stores token hashes only. Failed attempts are limited to five per direct peer and 50 globally per 15-minute window, with bounded tracking and concurrent password checks. On a single-machine proxy the per-peer limit is shared by all users, deliberately ignoring spoofable forwarded IPs. Authentication parser errors and public status never echo credential contents. The admin form and API logs must not be placed behind infrastructure that records password request bodies.

`getAdminAuthStatus(env)` returns only `{mode:'admin',configured:boolean}` for integration status. Account file contents are read at server startup; status checks may re-read configuration. Tests use generated fixtures in temporary directories, not the real account or private owner records.
