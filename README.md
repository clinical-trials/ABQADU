# ABQ ADU website and builder app

Start with [the combined project context](docs/project-context.md). It brings together the requirements and decisions from both original project tasks. Later user corrections take precedence over older designs and sample content.

The complete private chronological history is `../COMBINED_PROJECT_HISTORY.md`, outside this repository. Keep that history, customer records, credentials and backups out of public deployments. `../PROJECT_RECOVERY.md` records the latest operational checkpoint.

## Continue locally

Use this repository's existing data and configuration. From `platform/server`, run:

```sh
npm run doctor
npm run local
```

Check for an existing server on port 4000 before starting another. The local launcher binds to this Mac only and opens the existing builder workspace without Clerk. It does not create or migrate the database. See [local access and restart](docs/local-workspace.md).

- Homeowner website: <http://localhost:4000/>
- Complete builder app: <http://localhost:4000/command-center>
- Other builder tools are in the workspace Menu.

After homeowner edits, run `node scripts/package-homeowner-site.js` from this directory. After React edits, run `npm run build` from `platform/client`. Restart the server after server-code changes.

## Prepare a live release

Read [launch readiness](docs/launch-readiness.md), [full platform deployment](docs/version-10-platform-deployment.md) and [private access/payment configuration](docs/private-workspace-setup.md).

The homeowner site is public. The hosted builder app requires Clerk and approved staff accounts; `npm run local` is only for this Mac. GitHub Pages can serve the packaged homeowner assets, while the builder needs Express, PostgreSQL and persistent Command Center storage. A GitHub push alone does not deploy either experience.

Preserve both saved data stores. Do not reset the workspace, recreate the database or replay all migrations to repair a page. Payment, text and invoice-provider acceptance require separate configured accounts and deliberate tests.
