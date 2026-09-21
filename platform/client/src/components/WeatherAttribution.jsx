import React, { useState } from 'react';
import './WeatherAttribution.css';

const officialSources = 'https://developer.apple.com/weatherkit/data-source-attribution/';

function trustedUrl(value, hosts) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.includes(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

export default function WeatherAttribution({ forecast }) {
  const [failedMark, setFailedMark] = useState(null);
  if (forecast?.provider === 'nws' || (!forecast?.provider && forecast?.source === 'National Weather Service')) {
    const source = trustedUrl(forecast.attribution?.source_url, ['weather.gov', 'www.weather.gov', 'forecast.weather.gov', 'api.weather.gov']) || 'https://www.weather.gov/abq/';
    return <div className="weather-attribution"><a href={source} target="_blank" rel="noopener noreferrer">National Weather Service</a></div>;
  }
  if (forecast?.provider !== 'weatherkit' && forecast?.source !== 'Apple Weather') return null;

  const mark = trustedUrl(forecast.attribution?.mark_url, ['weatherkit.apple.com']);
  const legal = trustedUrl(forecast.attribution?.legal_url, ['weatherkit.apple.com', 'developer.apple.com']) || officialSources;

  return <div className="weather-attribution">
    {mark && mark !== failedMark
      ? <img src={mark} alt="Apple Weather" height={24} referrerPolicy="no-referrer" onError={() => setFailedMark(mark)} />
      : <span className="weather-attribution__name">Apple Weather</span>}
    <a href={legal} target="_blank" rel="noopener noreferrer">Weather data sources</a>
  </div>;
}
