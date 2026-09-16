# ABQ ADU recovery handoff — September 16, 2026

## Root cause and local state

The local full builder app had no `abqadu` PostgreSQL database. The homepage and browser-local static builder could still render, and the separate Command Center JSON API could respond, while PostgreSQL-backed tools failed. The recovery session created the local `abqadu` database and ran all six current migrations once.

The new read-only `npm run doctor` command was then run against the repaired local database and returned exit code `0`: PostgreSQL was reachable and all 22 required tables were visible. This records local database readiness, not public deployment or completion of every browser workflow.

**Do not rerun the migration runner on this repaired database just to resume work.** The runner has no applied-migration ledger and replays all SQL files. Migration `004_designs.sql` adds another set of default design layouts on repeat runs. Preserve existing database data and inspect missing schema changes individually if doctor reports a partial schema.

## Resume checks

1. Work in `website/platform/server`. Run `npm run doctor`; it is read-only and can be repeated. If a restricted environment denies the local PostgreSQL connection, rerun from a terminal with local database access.
2. Check the existing server process before starting another listener on port `4000`. `/health` checks the Express process only. Verify PostgreSQL-backed JSON routes such as `/api/portfolio`, `/api/clients`, `/api/designs/templates`, and `/api/invoices` separately.
3. Keep `DATABASE_URL` and other server configuration private. The doctor never prints connection strings or raw database error messages. Back up PostgreSQL before any further schema/data changes.
4. Preserve the separate Command Center JSON store selected by `COMMAND_CENTER_STORE_PATH`; database repair does not initialize, replace, or migrate it.
5. Rebuild `platform/client` after React changes so Express serves the current bundle. Run the relevant server/client tests and verify the changed UI workflows before declaring the app ready.
6. Review the local repair checkpoint before integration. No remote push, hosting change, or public deployment was performed. Follow the existing public-site publishing setup and validate the intended external URL separately.

## Homeowner recovery changes

The public homepage assessment form now prepares a reviewable request with explicit text, copy, download, and phone options. It does not claim a request was transmitted. No public intake endpoint or business email address was invented.

The homeowner wizard now restores a valid saved draft on load without silently saving over it. Blocked/full browser storage falls back to memory; unreadable saved values remain unchanged. The wizard and result summary visibly say that the design is kept in the current tab only and should be printed or shared before closing. Do not clear browser storage as a repair step; existing drafts may be the only copy of a homeowner's work.

Targeted homeowner checks are in `tests/homeowner-assessment.test.js` and `tests/homeowner-draft-storage.test.js`. Database diagnostic checks are in `platform/server/tests/doctor.test.js`.

The complete setup sequence and migration caveat are in [Version 10 Platform Deployment](version-10-platform-deployment.md).

## Integrated repair verification

- All 24 API routers register async handlers through the shared Express 4 wrapper; request errors return JSON and do not terminate the server. Missing database, refused connection, database startup, and unexpected errors are covered by process-survival regressions. Unknown API URLs return JSON 404.
- Real project creation and selection replace hardcoded project 1 navigation. Unknown project URLs do not silently edit another project. The Command Center project store remains separate from the PostgreSQL portfolio.
- Checked requests on Portfolio, Clients, Bids, Invoices, Schedule, Field Ops, Risks, and Design show failures and preserve failed-save inputs. Schedule retries retain unsaved activity edits; pending saves prevent competing edits/selection. Template requests dismissed by the user cannot later overwrite the canvas.
- Static builder storage failures use memory with an explicit warning and downloadable backup. Malformed originals are preserved, and exporting from Bids before opening Estimates no longer clears saved estimate fields.
- Final automated checks: 55 client tests in 6 suites; 101 server tests in 15 suites; 29 website checks. Server HTTP tests need permission to bind local test ports. The optimized client build compiles successfully.
- Browser verification: created a temporary PostgreSQL project, added a field task, marked it complete, verified its stored status, and returned to Portfolio without a crash. Design templates load. The homeowner assessment creates a reviewable unsent request at desktop and phone widths. Temporary project/task records were deleted after verification.
- Core local APIs (`/health`, portfolio, clients, bids, invoices, design templates, Command Center) return HTTP 200 with JSON. `npm run doctor` reports all 22 required tables present.

Local services during handoff: full app on port 4000; localhost-only public website preview on port 4001. Public deployment is still pending; the provided GitHub Pages URL has not been modified by this repair. A public host for the Express app has been requested. The Pages workflow still targets `version6aduwizard` and uploads the static repository; it does not deploy the React/Express app. Preserve the working local app while arranging that separate deployment.
