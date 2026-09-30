# Version 10 Platform Deployment

Version 10 requires the full platform app: React build output plus the Express API server. Static-only GitHub Pages is insufficient for the builder Command Center because the builder tools save and load project, estimate, supplier, invoice, weather, receipt, and mileage data through server routes.

GitHub Pages can still host the public homeowner website, but it cannot serve the Version 10 builder tools by itself.

## Database setup and recovery

The full builder app requires a running PostgreSQL service **and** an initialized database. Projects, schedules, clients, bids, invoices, designs, field tasks, and risks use PostgreSQL. Installing Node packages or starting Express does not create this database. `/health` only confirms that Express is responding; it does not check PostgreSQL.

From `platform/server`, install dependencies and run the read-only diagnostic:

```bash
npm install
npm run doctor
```

The diagnostic checks connectivity, all 24 required tables, and 28 billing columns using the application's database role and search path. This includes the Stripe checkout and webhook tables, invoice source snapshots, and payment retry fields introduced by `007_billing_ledger.sql`. It returns exit code `0` when those checks pass and `1` when setup is missing or the connection fails. It does not create a database, change data, run migrations, or print connection credentials. It is safe to rerun. A passing result does not verify column types, every other column, indexes, constraints, write permissions, external integrations, or backups.

The default connection is a local database named `abqadu` on PostgreSQL port `5432`. Set `DATABASE_URL` in `platform/server/.env` for another database. Create `.env` from `.env.example` only if it does not already exist; retain existing configuration. The PostgreSQL service must be running, and the configured role needs access to the database and schema.

For a **fresh local installation with no existing `abqadu` database**, run these commands from `platform/server` after PostgreSQL is available:

```bash
createdb abqadu
npm run migrate
npm run doctor
```

`createdb` uses your PostgreSQL client connection settings. For a custom or hosted `DATABASE_URL`, have the database administrator create that intended database and grant the application role access before running migrations against it. If the database already exists, run `npm run doctor` first instead of creating it again.

**Run the current migration runner once on a fresh database.** `src/migrations/run.js` executes all seven SQL files in order and has no migration-history ledger. Although the table creation statements are guarded, `004_designs.sql` inserts default layouts into `designs` again on every run. Repeating `npm run migrate` can therefore duplicate layouts. For an existing or partially initialized database, back it up, inspect which migrations/schema changes are missing, and apply only the necessary changes under review. If doctor identifies missing billing tables or columns on a database whose earlier migrations are present, review and apply only `src/migrations/007_billing_ledger.sql` in one transaction, then rerun doctor. Do not drop the database or replay all migrations merely because a page reports an error.

The Command Center uses a separate JSON store configured by `COMMAND_CENTER_STORE_PATH` (or its server default). A healthy `/api/command-center` response does not prove that the PostgreSQL-backed pages work. Jobs created there are not automatically PostgreSQL projects in Portfolio, Schedule, Field, or Risks; those tools currently have their own project records. Preserve both PostgreSQL data and the Command Center JSON file across releases. Run one server process against the JSON store; multiple writers require a shared transactional store first.

If doctor fails, follow its specific guidance: create the missing database, start/reach PostgreSQL, correct credentials, or resolve schema permissions. A restricted execution environment may block even a local database connection; rerun the read-only command from a terminal permitted to connect to PostgreSQL. See [September recovery notes](2026-09-16-app-recovery-notes.md) before continuing this recovery session.

## Local test URL

For continued development on this Mac without Clerk, use `npm run local` from `platform/server`. It opens the complete existing workspace with the existing data, bound only to `127.0.0.1`. See [Local workspace access](local-workspace.md). This mode cannot be used for LAN or public deployment; normal `npm start` keeps Clerk authentication.

- `http://localhost:4000/` is the homeowner website. Models, local service categories, and request drafts need no sign-in.
- Use `http://localhost:4000/command-center` for same-machine testing.
- `/portfolio` is the private portfolio route; the workspace menu links there. `/platform.html` redirects to `/command-center` on the Express host.
- Sign-in screens include a link back to the homeowner website. They do not unlock saved project or billing records when Clerk is unconfigured.
- For a deployment bundle, run `node scripts/package-homeowner-site.js` from the website root. It packages only homeowner assets into `platform/server/public-homeowner`. Re-run after homeowner edits. Local development can use the website source when no bundle exists.
- From `platform/client`, run `npm run build`.
- From `platform/server`, install dependencies, complete the database setup above, run `npm run doctor`, and then `npm start`.
- Verify local routes before copying to a host:
  - `http://localhost:4000/health`
  - `http://localhost:4000/command-center`
  - `http://localhost:4000/api/command-center`
  - `http://localhost:4000/api/portfolio`
  - `http://localhost:4000/api/clients`
  - `http://localhost:4000/api/designs/templates`
  - `http://localhost:4000/api/invoices`
  - `http://localhost:4000/api/weather/forecast?zip=87106`

The PostgreSQL list routes should return successful JSON responses; an empty array can be valid for a newly initialized database. Test one project/client workflow in the UI as well, since a readable schema alone does not verify writes.

## Hosted workspace sign-in

Clerk is required for the private workspace on a public host or another device. Configure matching `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`, the approved staff IDs in `CLERK_ALLOWED_USER_IDS`, and the exact HTTPS app origin in `APP_ORIGINS`. Follow [Private workspace and billing setup](private-workspace-setup.md). Missing or invalid configuration deliberately locks the private API with a `503` response even when `/health` succeeds.

Set `NODE_ENV=production` on the host and leave `ABQ_LOCAL_WORKSPACE` unset. The local launcher is restricted to direct loopback development and refuses production; it cannot provide hosted access. Configure host credentials privately rather than copying this Mac's environment. Verify an approved account can open the workspace and that signed-out and unapproved accounts cannot read business records. Private API checks below require the approved session bearer token; a plain unauthenticated URL check must not return records.

## LAN URL

- Use a LAN URL only for devices on the same network. Private workspace access from another device still requires Clerk and an HTTPS origin; plain HTTP at an address such as `http://10.0.0.166:4000/` is suitable only for checking the public site or health.
- The older `10.0.0.166:3001` design server is a private-network address, not a public external URL.
- Do not send a LAN URL as the external review link unless the reviewer is on that same network or connected through VPN.

## Public external URL

- Public review requires a reachable public host or tunnel.
- Valid options include a public VPS with nginx or Caddy, Cloudflare Tunnel, Tailscale Funnel, ngrok, or another HTTPS tunnel/reverse proxy that reaches the Express server.
- The public URL should route browser requests for `/command-center` to the Express process, not to static GitHub Pages.
- Re-check `/health` and `/api/command-center` from a phone or network outside the LAN before calling the review link ready.

## Build And Deploy Sequence

1. From the website root, run `node scripts/package-homeowner-site.js`, then from `platform/client` run `npm run build`.
2. Copy `platform/client/build` to the target host.
3. Copy `platform/server`, including its generated `public-homeowner` folder, to the target host, excluding `node_modules`. Preserve private server configuration and existing data.
4. From the copied `platform/server`, run `npm install --omit=dev`.
5. Configure the host's `DATABASE_URL`, provision PostgreSQL and a database if needed, and initialize a fresh database once as described above. Preserve existing data on subsequent releases.
6. Run `npm run doctor` on the target host. Resolve any database/schema failures and configure the required hosted Clerk settings above before starting the review.
7. Start or restart the Node process with `npm start`, systemd, pm2, or the host's process manager.
8. Verify `/health`, `/command-center`, `/api/command-center`, `/api/portfolio`, `/api/clients`, `/api/designs/templates`, `/api/invoices`, and `/api/weather/forecast?zip=87106`.
9. If this is for public review, verify the same routes through the public domain or tunnel URL.

## Example Script

`deploy-platform.example.sh` performs the build and copy steps, but it intentionally requires a caller-supplied `TARGET_HOST`. It does not define the public review URL because that must be a reachable host or tunnel chosen for the deployment.

```bash
TARGET_HOST=ahmad@example.com TARGET_DIR=/home/ahmad/abqadu-platform ./deploy-platform.example.sh
```

The example copy script preserves the host's server `.env`, `.env.*`, `config/`, `data/`, and `backups/`, plus PEM, KEY, and P8 files. These paths are excluded from upload and from `rsync --delete`; local credentials and local job files are not copied. Provision host configuration separately and retain a database backup. Custom private paths must live outside the release directory or receive their own exclusion before using this script. The script does not provision PostgreSQL or configure authentication. After completing those on the host, check readiness and start the server:

```bash
cd /home/ahmad/abqadu-platform/platform/server
npm run doctor
npm start
```

## Required Environment Variables

- `PORT`: Express port. Defaults to `4000` when unset.
- `DATABASE_URL`: PostgreSQL connection for the full builder app. Defaults to local database `abqadu` on port `5432`; the database must exist and have the schema initialized. Keep credentials in server configuration, never in public website files.
- `COMMAND_CENTER_STORE_PATH`: Optional writable JSON store path for command center data. Use an absolute path on the server if the deploy directory is replaced during releases.
- `NODE_ENV`: Set to `production` for hosted review.
- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_ALLOWED_USER_IDS`, and `APP_ORIGINS`: Required for hosted private workspace access. The origin must match the final HTTPS URL exactly.

Stripe, Twilio, InvoiceShelf, SMTP, EspoCRM, OCR, and optional weather-provider credentials are needed only for their corresponding features. Do not present those integrations as live until their configuration and provider acceptance checks are confirmed on the host.

## Review Readiness Checklist

- `npm run build` completed for `platform/client`.
- Server dependencies installed on the host with `npm install --omit=dev`.
- PostgreSQL is running, the configured database exists, and `npm run doctor` succeeds on the target host.
- Hosted Clerk configuration is valid, an approved staff account can sign in, and signed-out and unapproved accounts cannot read business records.
- A fresh database was initialized once; an existing database was preserved and any missing schema changes reviewed before application.
- The Express process is running and serving the React build.
- `/health` returns a successful response.
- `/command-center` loads through the intended URL.
- `/api/command-center` returns JSON.
- `/api/portfolio`, `/api/clients`, `/api/designs/templates`, and `/api/invoices` return successful JSON responses, and a representative UI save works.
- `/api/weather/forecast?zip=87106` returns a response or a documented provider/configuration error.
- Public review link uses a reachable public host or tunnel, not static-only GitHub Pages and not a private LAN address.
