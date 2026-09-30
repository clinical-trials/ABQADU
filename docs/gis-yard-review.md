# Intake address and GIS yard review

The early project sequence is inquiry → address → desktop GIS review → site visit. The visit target is 24–72 hours after inquiry, with the appointment confirmed separately.

## Homeowner and contractor handoff

Public ADU assessment and design request drafts include the entered address, a pending GIS review request, parcel/zoning/access/easement/utility checks, and official map links. Blank addresses remain unknown; other service requests do not acquire ADU GIS tasks. Preparing or copying a request does not deliver it. A configured design intake endpoint must return its existing acceptance receipt before the site reports delivery.

The legacy file-based Estimates page has a **Prepare GIS yard review** card below Client + Document Setup. It reads the current job address, prepares a copyable handoff, and invalidates that handoff when the address changes. Legacy browser drafts are preserved; they are not silently migrated to the private app.

In the private Command Center, **Check the yard before the visit** uses the selected job’s intake address. Contractors can queue a review, save findings and a checklist, record the jurisdiction and parcel reference, and enter optional approximate yard dimensions. Width × depth is labeled a recorded rectangle, not buildable area. A recorded desktop review requires a matched parcel and written findings. A checked item means it was reviewed, not that the property complies.

## Water, electric and sewer first

The builder’s first three questions are now separate, visible checks:

- **Water:** connection and meter location, available service information, route to the ADU, and capacity to verify.
- **Electric:** panel and service capacity, route to the ADU, and whether a meter or service upgrade needs investigation.
- **Sewer:** connection location, depth and slope, with a qualified trade reviewing the gravity route or a possible pumping need.

Each private review records `unknown`, `in_review`, `needs_work` or `confirmed`, plus up to 2,000 characters of findings. Confirmation requires written findings of at least ten characters; the interface asks for who checked, when, source and findings. This validates a recorded builder review, not utility-provider approval. No connection, capacity, depth, upgrade or cost is inferred from a map or the old combined checkbox.

Earlier utility/sewer flags remain visible as reference notes. Current, separate findings determine utility readiness; missing, stale or unresolved findings prevent a **Ready to send** label. The weekly briefing names the unresolved utilities before final-bid recommendations and includes them in its audio transcript. Other site, engineering, site-plan and supplier checks still apply.

Public and legacy request drafts include these three questions with unknown status. They do not expose private findings or ask homeowners to supply engineering answers. The old Estimates page links to the saved workspace for recording results rather than creating a second utility-status store.

## Maps and limits

- [City planning GIS](https://www.cabq.gov/planning/agis-maps/about) links the City IDO web map. Its address search is prefilled using Esri’s documented [`find` parameter](https://doc.arcgis.com/en/web-appbuilder/11.5/manage-apps/app-url-parameters.htm). Confirm the closest matched parcel before recording findings.
- [City Advanced Map Viewer](https://www.cabq.gov/gis/advanced-map-viewer) provides aerial imagery and parcel layers. Use **Copy address** and paste into its search. No unverified address parameter is attached to this viewer.
- City IDO layers do not include Bernalillo County zoning. The separate county resource link is a fallback; county coverage and address prefill are not claimed.

Links contact external maps only when opened. This feature does not automatically geocode, measure a parcel, establish setbacks, decide ADU eligibility, or send email/text. Map dimensions and parcel area cannot establish a buildable envelope. Confirm boundaries, easements, utilities, jurisdiction and field measurements before deciding whether an ADU fits.

## Saved records

Authenticated GET/PUT `/api/project-helper/projects/:projectId/gis-review` reads and saves the selected Command Center job’s review. Records carry an address snapshot and immutable revision. Expected address/version checks run inside the serialized save; request IDs support safe retries. Exact retries return the current record. Review events appear in project activity.

Changing or removing the saved address appends an invalidation while retaining earlier findings. Returning to the original address does not reactivate those findings. The user must explicitly start an empty queued review for the updated address. General job saves and resets cannot replace the server-owned `gis_reviews` history.

`utility_reviews` is stored inside the same immutable review revision as the yard findings. Legacy reviews without this object read as three unknown services without rewriting history. An older client omitting utility fields preserves current findings; an explicit stale restart clears them. Pre-extension request fingerprints remain valid for exact retries. Address changes invalidate utility findings together with the yard review, and copyable draft recovery includes unsaved utility notes.

Client drafts remain in memory per authenticated session and project, including uncertain request receipts. A conflict preserves edits for copying and requires explicit reload. Signing out clears drafts. Closing/reloading the page can lose unsaved edits, with the browser’s usual leave warning where supported.

The existing single-writer JSON-store deployment requirement remains. Save history is capped at 10,000 explicit review revisions; retain backups and plan archival before reaching that limit. Missing stores are reported unavailable rather than initialized by GIS reads. No real customer address was submitted to external GIS services during acceptance testing.
