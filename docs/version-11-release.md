# Version 11 — November 18, 2026

Review branch: `codex/nov-18-2026`.

## Homeowner website

- Main navigation focuses on models, process, design, financing, finding a local pro, and contact.
- One Contractor sign-in link in the footer replaces the competing builder navigation entries.
- Version 11 appears in the footer and contractor-access page.
- GitHub Pages deployment now follows this review branch using the existing public-only asset allowlist.

## Contractor app

- Version 11 badge appears throughout the app navigation.
- Office Assistant is accessible from the office menu.
- Mobile improvements cover navigation, client forms, bid layout/tables, portfolio cards, field columns, risk panels, schedule panels, and the floor-plan designer.
- Wide data tables, the risk matrix, and drawing/timeline surfaces scroll within their own panels.
- No saved customer data, storage keys, authentication rules, or invoice calculations are changed by this release.

## Hosting boundary

The public address is https://clinical-trials.github.io/ABQADU/ .
GitHub Pages serves the homeowner site, not the Express backend. `/command-center` at the root of `clinical-trials.github.io` is not a valid contractor deployment. The contractor app requires separate HTTPS server hosting and a configured `BUILDER_APP_URL` repository variable before the public sign-in page can link to it. Do not put private records or server configuration in the Pages artifact.

## Validation

- 798 client tests and 80 public-site tests passed.
- Production client build passed.
- Local Chrome responsive checks covered 13 views at 320, 390, 768, 1024, and 1440 pixels with fictional API fixtures: no document-level horizontal overflow.
- These checks validate layouts, not live provider delivery, production database operations, or physical-device gesture behavior.
