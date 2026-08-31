// Raw-fetch client for Open-Meteo (no SDK, no API key — free for non-commercial
// use), mirroring the raw-fetch convention already used for PayPal (src/lib/paypal.ts).
// Two endpoints: forecast.open-meteo.com's daily forecast (up to 16 days) and
// archive-api.open-meteo.com's historical archive (back to 1940). Both require
// lat/lng, not a city name — see root CLAUDE.md's Feature 61 section for why.

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_BASE = 'https://archive-api.open-meteo.com/v1/archive';
const DAILY_PARAMS = 'weather_code,temperature_2m_max,temperature_2m_min';

export interface WeatherDayReading {
  date: string;       // yyyy-mm-dd
  tempMaxC: number;
  tempMinC: number;
  weatherCode: number;
}

interface OpenMeteoDailyResponse {
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

function normalize(data: OpenMeteoDailyResponse): WeatherDayReading[] {
  const { time, weather_code, temperature_2m_max, temperature_2m_min } = data.daily;
  return time.map((date, i) => ({
    date,
    tempMaxC: temperature_2m_max[i],
    tempMinC: temperature_2m_min[i],
    weatherCode: weather_code[i],
  }));
}

/** Up to `days` (max 16, Open-Meteo's own ceiling) days of daily forecast starting today. */
export async function fetchForecast(lat: number, lng: number, days: number): Promise<WeatherDayReading[]> {
  const url = new URL(FORECAST_BASE);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('daily', DAILY_PARAMS);
  url.searchParams.set('forecast_days', String(days));
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo forecast error: ${res.status} ${await res.text()}`);
  const data = await res.json() as OpenMeteoDailyResponse;
  return normalize(data);
}

/** Historical daily readings for an inclusive [startISO, endISO] range (yyyy-mm-dd). */
export async function fetchHistoricalRange(
  lat: number,
  lng: number,
  startISO: string,
  endISO: string,
): Promise<WeatherDayReading[]> {
  const url = new URL(ARCHIVE_BASE);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('daily', DAILY_PARAMS);
  url.searchParams.set('start_date', startISO);
  url.searchParams.set('end_date', endISO);
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo archive error: ${res.status} ${await res.text()}`);
  const data = await res.json() as OpenMeteoDailyResponse;
  return normalize(data);
}
