# Apple Weather for the private builder

The Command Center weather panel now requests Apple WeatherKit forecasts through the authenticated server. It displays current conditions and three daily forecasts in Fahrenheit, miles per hour and inches. ABQ ADU derives construction-risk and delay allowances from those measurements; those allowances are application planning estimates.

Live acceptance requires your Apple Developer account configuration. Adding environment variables does not verify a working Apple connection. No Apple account or subscription is created by this change.

## Private configuration

1. Use an Apple Developer Program membership and follow Apple's [WeatherKit setup instructions](https://developer.apple.com/help/account/capabilities/create-a-services-identifier-and-private-key-for-weatherkit/) to create the Services ID and WeatherKit-enabled signing key.
2. Preserve existing database, Clerk and Stripe settings in `platform/server/.env`. Add:

```dotenv
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

4. Restart the app server. Sign in with an approved Clerk account, open Command Center, select a project, and choose **Check Weather**. WeatherKit is also listed under **Set up services**; that status describes local configuration only.

## What to verify with the account

- The location label, current temperature and three dates match the configured site/time zone. Confirm a forecast against Apple's response before relying on the integration.
- The official Apple Weather mark and **Weather data sources** link appear alongside the forecast and saved Apple weather records.
- **Log Weather Risk** obtains a server forecast and creates local activity/crew drafts. Browser-supplied weather figures are ignored. No SMS is sent by checking or logging weather.
- A failed refresh clears the current forecast and disables logging that stale display. Missing credentials, unmapped locations and provider errors show a message without inventing weather data.
- Previous wttr.in records retain their original source. They are not relabeled as Apple forecasts.

## Attribution and provider contracts

The official mark comes from `https://weatherkit.apple.com/attribution/en`. The legal link uses the weather response's attribution URL, with the supplied [Apple data-sources page](https://developer.apple.com/weatherkit/data-source-attribution/) as the fallback. Saved checks retain the provider and attribution. Any future report or PDF displaying Apple weather must carry that attribution forward.

The forecast request uses Apple's [REST weather endpoint](https://developer.apple.com/documentation/weatherkitrestapi/get-api-v1-weather-_language_-_latitude_-_longitude_) with `currentWeather`, `forecastDaily`, `forecastHourly` and the configured time zone. Apple supplies metric measurements; the server converts them once for display and the existing planning rules. Hourly forecasts provide daily maximum winds; unavailable gusts are not invented as zero. Current precipitation intensity is a rate, separate from daily precipitation amount.

Official references: [server authentication](https://developer.apple.com/documentation/weatherkitrestapi/request-authentication-for-weatherkit-rest-api), [attribution endpoint](https://developer.apple.com/documentation/weatherkitrestapi/get-attribution-_language_), [WeatherKit attribution requirements](https://developer.apple.com/weatherkit/).

## Verification — September 21, 2026

306 server tests (including isolated PostgreSQL billing checks), 142 client tests and 30 public/static checks pass; the production client build succeeds. WeatherKit tests verify ES256 signatures, coordinates/time zones, imperial conversion, freshness, missing measurements, attribution, safe errors and timeouts using fixtures. The official public attribution endpoint was checked directly, and the real attribution component was visually checked at 390 px with Apple's black wordmark on a light background. Authenticated live forecasts remain unverified until account settings are supplied.

Weather logging appends against the latest Command Center state and publishes JSON atomically, preserving edits made while Apple responds. Its save queue assumes the current single server process; multiple app instances need shared transactional storage.
