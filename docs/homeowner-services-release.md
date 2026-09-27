# Homeowner services update — September 27, 2026

The homepage now features Stucco, Yardwork, and House cleaning. Each card opens the quote form with that service selected. Contact details and notes are preserved. ADU model/use fields are hidden and omitted for home-service requests, and restored when ADU assessment is selected again.

Prepare My Request creates a reviewable, unsent request with text, copy, download, and phone options. It does not submit to a server or prove delivery. Changing the service invalidates the previous prepared request. Contractor membership prices are labeled as a preview; subscriptions, contractor accounts, and automatic dispatch are not active.

## Publishing state

The public site already has permanent GitHub Pages hosting at https://clinical-trials.github.io/ABQADU/. The private Express app needs separate hosting, PostgreSQL, persistent Command Center storage, and account configuration.

Read-only checks on September 27 found the live public site on the older `Version-10` native Pages deployment (commit `9456572`), while development is on `codex/version-10-workflows`. The current safe deployment workflow builds only the homeowner assets into `public-dist`; it triggers from `version6aduwizard` or a manual workflow dispatch. Pushing the development branch alone does not publish the site.

Publishing needs an authenticated repository administrator to confirm **Settings → Pages → Build and deployment → Source: GitHub Actions**, plus any repository environment restrictions. The available browser was signed out during this update. SSH Git access works but does not grant access to the Pages settings UI/API.

After confirming Actions publishing, deploy the reviewed release through the workflow and verify both `/index.html#contractors` and `/platform.html`. The latter must show the private workspace sign-in entry, not the legacy browser-local builder. Set `BUILDER_APP_URL` only when the private HTTPS host is ready. Do not publish the full repository tree or force-push over the older branches.

## Verification

Run `node --test tests/*.test.js`. The service request tests cover the selected trade in text/download drafts, preserved notes, omitted ADU details, switching back to an ADU assessment, and invalidating stale request previews. The public artifact test verifies private application files are excluded.

Clerk, Stripe, Twilio, and InvoiceShelf were still unconfigured in the local server during this update. Add their settings privately as described in `private-workspace-setup.md` and `contractor-field-setup.md`; do not commit credentials. Setup status alone is not provider acceptance testing.
