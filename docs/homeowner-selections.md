# Homeowner selections checklist PDF

The checklist is a standalone PDF resource for the contractor's document collection. It is not a website page, web form, app menu item, or customer-record feature.

## Document location

Project root: `/Users/lgm/Documents/ChatGPT/ABQ ADU`

PDF: `output/pdf/ABQ-ADU-homeowner-selections-checklist.pdf`

The PDF belongs outside the `website` repository and public build. Use it for a homeowner's initial review of kitchen appliances, ceiling fans and comfort, laundry, finishes, bathroom choices, and optional adobe refinishing or accent-window discussions. Uncertain choices can remain undecided. The contractor confirms final products, dimensions, utility requirements, scope, pricing, lead times, and approvals separately.

## Retired web prototype

The original HTML, JavaScript, stylesheet, and standalone worksheet test are preserved under project-root `reference/homeowner-selections-web-prototype/`. Its manifest records the original paths and file hashes. This archive stays outside the website Git repository and is not published. Original browser drafts and private project records have not been read, deleted, or migrated.

The former page and asset paths are removed from source publication and the public-build allowlist. The Express server returns a plain-text HTTP 410 response for those retired paths, including when stale files remain in an older bundle. They never fall through to the private app shell. The static GitHub Pages artifact contains none of the retired assets. Homeowner and contractor navigation no longer links to them.

## Verification

Run `node --test tests/public-artifact.test.js` from `website` to verify the public artifact excludes the retired worksheet and replacement packaging removes stale files without touching saved server data. Run `npm test -- --runTestsByPath tests/publicHomeowner.routes.test.js` from `website/platform/server` to verify HTTP 410 behavior and the existing public/private access boundary.

No website PDF library or automatic delivery workflow is added. The PDF can be reviewed and shared independently of the website.
