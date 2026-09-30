# Intake address and GIS yard review

The early project sequence is inquiry → address → desktop GIS review → site visit. The visit target is 24–72 hours after inquiry, with the appointment confirmed separately.

## Homeowner and contractor handoff

Public ADU assessment and design request drafts include the entered address, a pending GIS review request, parcel/zoning/access/easement/utility checks, and official map links. Blank addresses remain unknown; other service requests do not acquire ADU GIS tasks. Preparing or copying a request does not deliver it. A configured design intake endpoint must return its existing acceptance receipt before the site reports delivery.

The legacy file-based Estimates page has a **Prepare GIS yard review** card below Client + Document Setup. It reads the current job address and entered floor areas, prepares a copyable handoff, and invalidates that handoff when the address or either area changes. Legacy browser drafts are preserved; they are not silently migrated to the private app.

In the private Command Center, **Check the yard before the visit** uses the selected job’s intake address. Contractors can queue a review, save findings and a checklist, record the jurisdiction and parcel reference, and enter optional approximate yard dimensions. Width × depth is labeled a recorded rectangle, not buildable area. A recorded desktop review requires a matched parcel and written findings. A checked item means it was reviewed, not that the property complies.

## Water, electric and sewer first

The builder’s first three questions are now separate, visible checks:

- **Water:** connection and meter location, available service information, route to the ADU, and capacity to verify.
- **Electric:** panel and service capacity, route to the ADU, and whether a meter or service upgrade needs investigation.
- **Sewer:** connection location, depth and slope, with a qualified trade reviewing the gravity route or a possible pumping need.

Each private review records `unknown`, `in_review`, `needs_work` or `confirmed`, plus up to 2,000 characters of findings. Confirmation requires written findings of at least ten characters; the interface asks for who checked, when, source and findings. This validates a recorded builder review, not utility-provider approval. No connection, capacity, depth, upgrade or cost is inferred from a map or the old combined checkbox.

Earlier utility/sewer flags remain visible as reference notes. Current, separate findings determine utility readiness; missing, stale or unresolved findings prevent a **Ready to send** label. The weekly briefing names the unresolved utilities before final-bid recommendations and includes them in its audio transcript. Other site, engineering, site-plan and supplier checks still apply.

Public and legacy request drafts include these three questions with unknown status. They do not expose private findings or ask homeowners to supply engineering answers. The old Estimates page links to the saved workspace for recording results rather than creating a second utility-status store.

## House and ADU sizes

Optional primary-house and proposed-ADU gross floor areas are recorded with the GIS review. Blank means unknown. Enter positive square feet with at most two decimals, up to 1,000,000; this technical input bound is not a permitted building size. The contractor can explicitly copy the job's proposed area into the review, then confirm it against plans before saving. The displayed house:ADU ratio is arithmetic only: 1,500 ÷ 750 gives 2:1. It does not establish a required ratio, allowed ADU size, zoning approval, or readiness to send a bid.

The [City IDO effective May 6, 2026](https://documents.cabq.gov/planning/IDO/2025_IDO_Update/IDO_2026_Effective-2026-05-06.pdf), §4-3(F)(6)(a), sets the general City ADU limit at **750 sq ft of gross floor area**. The measurement definitions include all floors measured to exterior walls and exclude an attached garage or shed from ADU area. No citywide 2:1 house-to-ADU requirement was verified. This reference is specific to the City, not the entire metro area; confirm the edition applicable to the application.

Choosing Albuquerque displays a comparison with that general cap, with a reminder that **Downtown CPO-3 in R-1 has a 650 sq ft limit** (§4-3(F)(6)(g)). Combined accessory-building coverage is also limited to 25% of combined side/rear yards (§5-11(C)(4)(a)). This is not a ratio to the primary house and cannot be determined from the optional rough yard rectangle. Overlays, setbacks, lot requirements and other conditions still require review. The app does not determine the property's jurisdiction or overlay, or calculate a complete legal envelope. Other/unknown jurisdictions receive no City pass/fail comparison.

Public assessment/design handoffs include pending sizing review with an unknown primary-house area and the selected model's area when known, explicitly subject to GFA confirmation. The legacy Estimates page saves an optional primary-house area alongside the existing draft and displays an arithmetic ratio. Neither interface claims that a room layout or model selection meets zoning requirements.

## Maps and limits

- [City planning GIS](https://www.cabq.gov/planning/agis-maps/about) links the City IDO web map. Its address search is prefilled using Esri’s documented [`find` parameter](https://doc.arcgis.com/en/web-appbuilder/11.5/manage-apps/app-url-parameters.htm). Confirm the closest matched parcel before recording findings.
- [City Advanced Map Viewer](https://www.cabq.gov/gis/advanced-map-viewer) provides aerial imagery and parcel layers. Use **Copy address** and paste into its search. No unverified address parameter is attached to this viewer.
- City IDO layers do not include Bernalillo County zoning. The separate county resource link is a fallback; county coverage and address prefill are not claimed.

Links contact external maps only when opened. This feature does not automatically geocode, measure a parcel, establish setbacks, decide ADU eligibility, or send email/text. Map dimensions and parcel area cannot establish a buildable envelope. Confirm boundaries, easements, utilities, jurisdiction and field measurements before deciding whether an ADU fits.

## Saved records

Authenticated GET/PUT `/api/project-helper/projects/:projectId/gis-review` reads and saves the selected Command Center job’s review. Records carry an address snapshot and immutable revision. Expected address/version checks run inside the serialized save; request IDs support safe retries. Exact retries return the current record. Review events appear in project activity.

Changing or removing the saved address appends an invalidation while retaining earlier findings. Returning to the original address does not reactivate those findings. The user must explicitly start an empty queued review for the updated address. General job saves and resets cannot replace the server-owned `gis_reviews` history.

`utility_reviews` is stored inside the same immutable review revision as the yard findings. Legacy reviews without this object read as three unknown services without rewriting history. An older client omitting utility fields preserves current findings; an explicit stale restart clears them. Pre-extension request fingerprints remain valid for exact retries. Address changes invalidate utility findings together with the yard review, and copyable draft recovery includes unsaved utility notes.

`size_review` stores `primary_house_sqft` and `adu_sqft` in the same revision as blank or canonical two-decimal strings. Legacy records read as unknown without a history rewrite. Omission preserves the latest values inside the serialized save while retaining old request fingerprints; explicitly blank fields clear current sizes. A stale address restart requires empty sizes. Draft recovery includes unsaved sizes, and save acknowledgements must match the submitted sizes before confirming a new save.

Client drafts remain in memory per authenticated session and project, including uncertain request receipts. A conflict preserves edits for copying and requires explicit reload. Signing out clears drafts. Closing/reloading the page can lose unsaved edits, with the browser’s usual leave warning where supported.

The existing single-writer JSON-store deployment requirement remains. Save history is capped at 10,000 explicit review revisions; retain backups and plan archival before reaching that limit. Missing stores are reported unavailable rather than initialized by GIS reads. No real customer address was submitted to external GIS services during acceptance testing.

## September 30 sizing verification

The backend suite passed all 689 tests with PostgreSQL integrations enabled. The React suite passed 348 tests; after adding two more size compatibility/receipt cases, the focused GIS suite passed all 40 tests (350 React cases overall). All 57 public/legacy tests passed, including saved estimate recovery and a late clipboard completion after a changed-area handoff. The production build passed. Independent review found no actionable defect.

The rebuilt local app was checked at 390px and 1440px with no horizontal overflow or console errors. Temporary unsaved values verified 1,500/750 → 2:1, over-750 City guidance, and withdrawal of that comparison for county jurisdiction; the entries were discarded and unknown defaults restored. No real customer sizing record was written. Public generated assets were refreshed. The legacy file page is covered by DOM tests; its browser navigation restriction was respected. This verification does not publish a live website or complete the property's zoning review.
