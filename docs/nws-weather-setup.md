# National Weather Service forecasts for ABQ ADU

National Weather Service is the default weather provider. Its numerical API supplies the four planning dates starting tomorrow in the location's time zone. No Apple account, subscription or weather API key is required. The private builder workspace still requires approved Clerk sign-in.

## Albuquerque reference and project locations

With no weather configuration, the existing default ZIP selector `87106` uses a reference point at **35.0844, -106.6504**, explicitly labeled **Albuquerque city forecast**. This is a city planning reference, not a geocoded job site or a claim that the coordinates represent that ZIP. Review the job's actual location, terrain and conditions before changing outdoor work.

For other ZIPs or a more appropriate site reference, configure a private map on the server:

```dotenv
WEATHER_PROVIDER=nws
NWS_LOCATIONS_JSON={"87106":{"latitude":35.0844,"longitude":-106.6504,"label":"Replace with your verified job location","timeZone":"America/Denver"}}
```

Replace illustrative coordinates and labels with verified locations. Custom entries override the built-in reference. One coordinate per ZIP is supported; separate jobs in that ZIP use the same configured reference. Unmapped ZIPs are rejected instead of silently substituting Albuquerque. Restart after changes and use **Update forecast** on the selected job.

The app identifies itself to NWS with a User-Agent containing its public website address. This is not an API credential. Requests are cached for up to ten minutes, with freshness checked before forecast data is returned. In-flight requests are shared; failures do not reuse expired forecasts. A source update over 24 hours old is rejected. Each request times out after ten seconds.

## Numerical readings and work decisions

- Temperatures are Fahrenheit, wind and gusts are miles per hour, and precipitation amounts are inches.
- Rain probability is the **maximum forecast-period chance** found for that local day. It is not a calculated chance of rain across an entire day or a guarantee of rain at a precise site.
- Missing measurements remain `null` and display as unavailable. Gaps in the day's temperature, rain or wind coverage prevent a clear planning result.
- Precipitation amounts are included only when the intervals can be attributed to the day reliably. An amount covering two calendar dates is not split into invented hourly rainfall.
- Condition text can indicate possible thunderstorms. The current feature does not ingest all NWS watches and warnings; the source link leads to official NWS information.
- Forecasts are forecasts. They do not replace a live observation, site inspection or contractor instructions.

The app's trade guidance belongs to ABQ ADU. It can flag a day for concrete, roofing, excavation or general work review; NWS does not endorse the app's thresholds. A contractor still confirms a day off explicitly, then shares the crew note. Checking weather sends no texts and makes no schedule or payment changes.

## Sources and optional Apple Weather

The NWS office page is [Albuquerque weather](https://www.weather.gov/abq/). The integration discovers the forecast grid via [NWS API point lookup and forecast documentation](https://www.weather.gov/documentation/services-web-api), then reads official numerical forecasts. The API is free public data and requires an identifying User-Agent. Provider URLs are restricted to official HTTPS NWS hosts; errors do not silently switch weather providers.

For Apple Weather, select `WEATHER_PROVIDER=weatherkit` and follow [the Apple setup guide](apple-weather-setup.md). Existing Apple records retain their Apple attribution. NWS records carry NWS source links and never show the Apple mark. Selecting Apple requires its credentials; a failed Apple request does not fall back invisibly to NWS.

## Acceptance check

Use **Update forecast**, confirm the source says **National Weather Service**, the reference location is appropriate, and the four dates match tomorrow through three days later in Albuquerque. Review the source update timestamp and missing-data notes. Compare values with the corresponding NWS forecast; hourly maxima need not equal a 12-hour summary or a forecast at a different point. Logging weather obtains the selected provider's data again on the server and retains that provider with the saved record.

Automated tests use isolated forecasts and stores. A read-only live NWS request can verify external connectivity without writing a project record, sending a message, making a payment or weakening private workspace access.
