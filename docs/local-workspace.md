# Continue building the complete local app

The homeowner website and the existing builder application can run together on this Mac. Local development access uses the existing PostgreSQL database and Command Center JSON store. It does not create a sample project, reset data, run migrations, or configure external services.

From `platform/server`:

```sh
npm run local
```

The server listens only on `127.0.0.1`, port 4000 by default. Stop an existing ABQ ADU server on that port before starting another. Then open:

- `http://localhost:4000/` — homeowner website, models, local trades, and request drafts.
- `http://localhost:4000/command-center` — saved jobs, contractor tools, weather, estimates, and packet printing.
- `http://localhost:4000/portfolio` — project portfolio. Other existing tools remain in the workspace Menu.

The app opens a local session automatically and displays **Local workspace · Saved project data · this Mac only**. No Clerk account is required for this explicit development mode. **Close workspace** ends that browser session; **Reopen local workspace** creates a new one. This mode trusts users and programs on this Mac. Closing a session is not an operating-system login lock, and another local session can be opened by someone with access to the computer.

## Access boundaries

Normal `npm start` retains Clerk sign-in and approved staff access. Local mode requires `ABQ_LOCAL_WORKSPACE=1`, `NODE_ENV=development`, and `HOST=127.0.0.1`; the dedicated launcher selects these settings. Production and non-loopback configurations fail closed. Local mode is not intended for LAN access, tunnels, reverse proxies, or public deployment.

Session creation checks the physical loopback connection, exact Host/port, same-origin request metadata, a required custom header, and JSON content type. Private API calls still require a valid, expiring bearer token and the local request checks. Tokens stay in browser memory; the server keeps only their digests. They are never stored in a URL or persistent browser storage. Closing a session revokes it; leaving the page also attempts revocation. Restarting the server invalidates all local sessions. Sessions expire after eight hours, and the least recently used session is revoked if 64 sessions accumulate, so abandoned tabs cannot prevent fresh entry. An expired session closes the private UI and requires explicit reopening. Failed writes are not automatically replayed through a new session.

External features remain independently configured: Stripe payments, incoming Twilio texts, InvoiceShelf, and OCR still need their service settings. The National Weather Service feed needs no keys. Do not treat local access as evidence that provider acceptance testing or public hosting is complete.

## Preserve the existing work

- Keep `platform/server/.env` private and preserve its database settings.
- Keep both PostgreSQL data and `platform/server/data` (or the configured Command Center store path).
- Do not use Reset or replay the migration runner to make the app load.
- Existing user-scoped drafts remain separate from the local-owner session. Older unassigned drafts are preserved for review rather than silently imported.
- After React changes, run `npm run build` from `platform/client`.
- After homeowner edits, run `node scripts/package-homeowner-site.js` from the website directory to refresh the served public bundle.

Use `npm run doctor` from `platform/server` for a read-only database connectivity check. Local access restores development usability; it does not expose private project records on the public homeowner website.
