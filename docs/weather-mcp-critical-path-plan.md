# Weather MCP Critical Path Plan

Last updated: July 22, 2026

## Source pattern

The `weather-mcp/weather-mcp` repository is useful as the backend pattern for weather-aware builder scheduling. The ABQ ADU platform should eventually connect MCP-backed weather data to the existing CPM schedule, rather than treating weather as a loose note.

## Weather inputs to support

- Rain / monsoon: especially exterior work, roofing, foundation, site prep, and job-site delivery.
- Wind: especially roofing, panel lifts, exterior work, tall walls, and material handling.
- Wildfire smoke / air quality: crew safety, outdoor work, ventilation, and restart decisions.
- Wildfire proximity: evacuation/fire routing, delivery route risk, job-site safety, insurance exposure.
- Lightning: same-day stop-work for roof/exterior/elevated work.
- Heat: concrete cure, roofing, drywall mud, worker safety, rest/water cycles.
- Freeze / frost: concrete, plumbing, adhesives, stucco, paint, and exterior water lines.

## MCP tools to map into the builder app

- Forecast
- Current weather
- Weather alerts
- Air quality
- Wildfire information
- Lightning / radar
- Service status
- Location search and saved jobsite locations

## Current Version 7 implementation

- The Schedule & Critical Path tab includes a Weather Delay Assessor.
- Builder manually logs location, weather hazard, affected activity, severity, and weather days.
- Builder can save jobsite weather locations for repeat use.
- Builder can load demo events for monsoon rain, roofing wind, and wildfire smoke / AQI.
- The tool checks whether the affected activity is on the critical path.
- Critical-path weather delays move the finish date; noncritical weather delays consume float first.
- The tool generates a textable recovery plan for Ian / builder.
- Each logged weather event can generate a crew-specific text draft.
- The UI displays the MCP source-readiness cards that should eventually power automation: forecast, current weather, alerts, air quality, wildfire information, lightning, radar, and weather-service status.

## Future backend flow

1. Save each jobsite location with city, address, and coordinates.
2. Pull daily forecast, alerts, AQI, wildfire proximity, wind, and precipitation.
3. Match weather hazards to active CPM tasks by trade and date.
4. Auto-create draft delay events for contractor approval.
5. Text subcontractors only after contractor approval.
6. Write the approved weather delay to the activity log and weekly briefing.
