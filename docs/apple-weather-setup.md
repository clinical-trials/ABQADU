# Apple Weather for the private builder

National Weather Service is now the default; see [NWS setup](nws-weather-setup.md). To use Apple WeatherKit instead, set `WEATHER_PROVIDER=weatherkit`. The Command Center then requests Apple forecasts through the authenticated server. Current conditions remain separate from the planning window: the next four local calendar days, starting tomorrow, in Fahrenheit, miles per hour and inches. A check on Monday, September 21, 2026 covers Tuesday, September 22 through Friday, September 25. The window advances with the configured site's local date.

Each day includes ABQ ADU planning guidance for concrete, roofing, excavation and general outdoor work. Guidance is `hold` (a weather hold candidate), `review`, `plan` or `unknown`. A hold is a candidate for postponement that requires contractor confirmation; it does not automatically cancel a shift or declare a day off. A plan result still requires site checks. These are application scheduling prompts, not Apple's recommendations or a concrete placement specification.

Live acceptance requires your Apple Developer account configuration. Adding environment variables does not verify a working Apple connection. No Apple account or subscription is created by this change.

## Private configuration

1. Use an Apple Developer Program membership and follow Apple's [WeatherKit setup instructions](https://developer.apple.com/help/account/capabilities/create-a-services-identifier-and-private-key-for-weatherkit/) to create the Services ID and WeatherKit-enabled signing key.
2. Preserve existing database, Clerk and Stripe settings in `platform/server/.env`. Add:

```dotenv
WEATHER_PROVIDER=weatherkit
WEATHERKIT_TEAM_ID=your_team_id
WEATHERKIT_KEY_ID=your_weatherkit_key_id
WEATHERKIT_SERVICE_ID=your_services_identifier
WEATHERKIT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_CONTENTS\n-----END PRIVATE KEY-----"
WEATHERKIT_LOCATIONS_JSON=
```

The private key is the PEM content of your downloaded `.p8` file. Keep it private. The backend signs short-lived ES256 tokens; neither signing keys nor bearer tokens are returned to the browser. `.env` and `.p8` files are excluded from Git.

3. Set `WEATHERKIT_LOCATIONS_JSON` to a JSON object mapping each project ZIP to its forecast coordinates, a readable label, and an IANA time zone. WeatherKit takes latitude/longitude and cannot resolve a ZIP by itself. Use the actual site or a deliberately chosen representative point. If multiple sites share a ZIP, this configuration uses the same point for them.

Example format with **illustrative coordinates to replace**:

```dotenv
WEATHERKIT_LOCATIONS_JSON={"87106":{"latitude":35.08,"longitude":-106.62,"label":"Albuquerque project — replace example location","timeZone":"America/Denver"}}
```

Unmapped ZIPs produce a setup message; the server does not substitute another city or provider. This release does not add automatic address geocoding.

4. Restart the app server. Sign in with an approved Clerk account, open Command Center, select a project, and choose **Update forecast**. WeatherKit is also listed under **Set up services**; that status describes local configuration only.

## What to verify with the account

- The location label, current temperature and four dates match the configured site/time zone. Confirm a forecast against Apple's response before relying on the integration.
- The official Apple Weather mark and **Weather data sources** link appear alongside the forecast and saved Apple weather records.
- **Log Weather Risk** obtains a server forecast and creates local activity/crew drafts. Browser-supplied weather figures are ignored. No SMS is sent by checking or logging weather.
- A failed refresh clears the current forecast and disables logging that stale display. Missing credentials, unmapped locations and provider errors show a message without inventing weather data.
- Previous wttr.in records retain their original source. They are not relabeled as Apple forecasts.

## Attribution and provider contracts

The official mark comes from `https://weatherkit.apple.com/attribution/en`. The legal link uses the weather response's attribution URL, with the supplied [Apple data-sources page](https://developer.apple.com/weatherkit/data-source-attribution/) as the fallback. Saved checks retain the provider and attribution. Any future report or PDF displaying Apple weather must carry that attribution forward.

The forecast request uses Apple's [REST weather endpoint](https://developer.apple.com/documentation/weatherkitrestapi/get-api-v1-weather-_language_-_latitude_-_longitude_) with `currentWeather`, `forecastDaily`, `forecastHourly` and the configured time zone. Apple's documented default daily horizon is ten days; its default hourly horizon is at least the requested daily horizon. The server selects exactly tomorrow through three days after tomorrow and rejects missing daily forecasts. Apple supplies metric measurements; the server converts them once for display and the existing planning rules. Current precipitation intensity is a rate, separate from daily precipitation amount.

Hourly wind coverage is checked against each daily forecast's actual start and end timestamps, including 23-hour and 25-hour daylight-saving transitions. Duplicate hourly entries do not fill a gap. A day's `wind_coverage` is `complete`, `partial` or `unavailable`; partial maxima describe only available hours, and absent wind/gust measurements are `null`. Every trade is at least review/unknown when hourly coverage is incomplete, unless a known hazard already warrants a hold candidate. Overall risk cannot be low solely because hourly data is absent. Optional gust values are not invented as zero.

The app's rain prompts begin at 60% chance or 0.10 in, with stronger concrete/excavation hold candidates at 75% or 0.15 in; roofing gets a hold candidate at the lower rain trigger. Winds of 25 mph or gusts of 35 mph prompt review and a roofing hold candidate. Lows of 35°F or less prompt review; 28°F or less make concrete a hold candidate. Highs of 100°F or more prompt review. These deliberately simple planning thresholds do not replace contractor instructions, soil/drainage inspection, equipment limits or current warnings. Daily or hourly thunderstorm condition codes produce an outdoor-work hold candidate; [NWS job-site lightning guidance](https://www.weather.gov/safety/lightning-job) informs the shelter and interruptible-work wording. Weather alerts are not yet part of the provider request, so a clear planning result is not an all-clear for site hazards.

The response includes `window: {start_date, end_date, time_zone}` and `days[].trade_guidance.{concrete,roofing,excavation,general}`, each with `level`, `label`, `reasons` and `message`. Existing legacy `risk_level`, `risks` and `delay_days` fields remain for compatibility. The new trade guidance and dated crew summary do not infer a fixed number of delay days from rainfall.

Official references: [server authentication](https://developer.apple.com/documentation/weatherkitrestapi/request-authentication-for-weatherkit-rest-api), [attribution endpoint](https://developer.apple.com/documentation/weatherkitrestapi/get-attribution-_language_), [WeatherKit attribution requirements](https://developer.apple.com/weatherkit/).

## Verification — September 21, 2026

WeatherKit tests verify ES256 signatures, coordinates/time zones, the next-four-day window, daylight-saving transitions, hourly coverage gaps, trade guidance, thunderstorm conditions, imperial conversion, freshness, missing measurements, attribution, safe errors and timeouts using fixtures. The official public attribution endpoint and branding were checked previously. Authenticated live forecasts remain unverified until account settings are supplied.

Weather logging appends against the latest Command Center state and publishes JSON atomically, preserving edits made while Apple responds. Its save queue assumes the current single server process; multiple app instances need shared transactional storage.
