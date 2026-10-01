# Homeowner selections checklist prototype

The public worksheet at `/selections.html` collects early appliance, comfort, laundry, finish, bathroom and optional exterior-upgrade preferences for a design conversation. It complements the existing model/design wizard and preconstruction form. It does not replace either, import a customer record, change the model estimate or submit an order.

## Homeowner flow

Start with the kitchen and continue through the other groups. Leave uncertain items undecided; the count represents preferences chosen, not approvals or construction readiness. Dishwasher, cooktop/range, stainless steel finish, counter-depth refrigerator and ceiling-fan choices are explicit. The homeowner can add a project nickname and notes, review the current summary, print/save it as a PDF using the browser, download text or copy it for sharing.

The worksheet offers an explicit save on the current device. The saved draft is separate from the model wizard's draft. It does not save to a contractor account or send information to the company. Device storage failures must leave current entries and exports usable, without reporting a successful save. An unreadable saved draft must be preserved rather than automatically overwritten. Notes and nickname remain text in every output.

The worksheet has 21 choices. Undecided, ask-the-builder, review-samples and later-phase answers stay in the summary without increasing the choices-made count. Controls start disabled until the worksheet initializes, so an unavailable script cannot accidentally submit preferences in a page URL. Unsaved edits prompt before leaving the page.

The optional exterior group offers adobe refinishing followed by an accent window. Homeowners can express interest in discussing pricing, skip either upgrade, defer it or ask for a recommendation. Discussion order is separate from construction sequencing; the builder confirms scope, pricing and installation timing. Both interests and exterior notes travel with the same saved and exported summary.

An exact original 19-choice/four-note device draft restores with the new exterior fields undecided and blank notes, without rewriting storage. Only another explicit save stores the expanded shape. Malformed, partial or unsupported drafts remain untouched.

The choices contain no product prices, verified dimensions, brands, availability or approved installation specifications. Final models, dimensions, clearances, utility requirements, allowances and lead times belong in the contractor's reviewed selection schedule. Choosing stainless steel or counter-depth records a preference only.

## Access and packaging

The worksheet is linked from the homeowner Design and Contact areas, mobile menu and footer. The builder menu opens it in a new tab so it does not replace an active private workspace. Relative homepage/asset links support the existing GitHub Pages project path.

The public build allowlist includes only `selections.html`, `homeowner-selections.js` and `homeowner-selections.css` in addition to the existing approved assets. Express serves those exact paths without a staff session. An incomplete bundled release does not fall through to private sign-in or borrow older source assets. Private jobs, owner planning data, environment files and business APIs retain their existing access boundary.

## Future work

After reviewing the prototype, add builder-approved allowance packages, product/model references, selected dimensions and explicit customer approvals. Linking a saved selection schedule to an actual job requires a deliberate import/review workflow; the first prototype has no backend handoff or automatic delivery.

## Verification

- Public suite: 74 passing checks, including 17 worksheet behavior tests and original-draft compatibility.
- Public server routing: 19 passing checks, including unconfigured-auth access and incomplete-release fallback protection.
- Existing builder client: 436 tests in 29 suites pass; production build succeeds.
- Local browser: requested appliance/fan choices update the current summary; no horizontal overflow at 320px, 390px or desktop; controls meet a 48px minimum height; no browser console errors observed.
- Text download and print-summary content/trigger are covered by isolated tests; PDF saving uses the homeowner's browser print dialog.
- Exterior update: both pricing-discussion choices appear in the current summary; 390px browser review shows no overflow or console errors. Existing builder/server code is unchanged by this addition.
