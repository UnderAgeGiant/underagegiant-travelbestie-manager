import { Request, Response, NextFunction } from 'express';
import { redis, weatherDayKey, WEATHER_CACHE_TTL } from '../lib/redis';
import { CITY_COORDS } from '../data/city-coords';
import { fetchForecast, fetchHistoricalRange, WeatherDayReading } from '../lib/open-meteo';
import { todayISO, addDaysISO, isoToDMY } from '../lib/weather-dates';
import { WeatherDayType, WeatherResponseDay } from '../types';

// Open-Meteo's own daily-forecast ceiling (see root CLAUDE.md's Feature 61 section).
const FORECAST_HORIZON_DAYS = 15;

interface CachedDay {
  type: WeatherDayType;
  tempMaxC?: number;
  tempMinC?: number;
  weatherCode?: number;
}

function classify(isoDate: string, today: string): 'forecast' | 'historic' {
  const horizon = addDaysISO(today, FORECAST_HORIZON_DAYS);
  return (isoDate >= today && isoDate <= horizon) ? 'forecast' : 'historic';
}

export class WeatherController {
  get = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const { cityId, isoDates } = req.weatherQuery!;
    const { lat, lng } = CITY_COORDS[cityId];
    const today = todayISO();

    // 1. Read whatever's already cached.
    const keys = isoDates.map(iso => weatherDayKey(cityId, iso));
    let cachedRaw: (string | null)[];
    try {
      cachedRaw = await redis.mget(...keys);
    } catch {
      cachedRaw = isoDates.map(() => null); // Redis unavailable — treat everything as a miss
    }
    const cached = new Map<string, CachedDay>();
    isoDates.forEach((iso, i) => {
      if (!cachedRaw[i]) return;
      try {
        cached.set(iso, JSON.parse(cachedRaw[i]!));
      } catch {
        // Corrupted/schema-mismatched cache entry (e.g. after a future CachedDay
        // shape change) — treat as a miss rather than letting JSON.parse throw
        // inside this async handler, which Express 4 would never catch and would
        // hang the request instead of returning a clean 4xx/5xx.
      }
    });

    // 2. Split the misses by forecast-eligibility (single pass — classify() is
    // date-parsing work, no need to run it twice per date).
    const forecastMisses: string[] = [];
    const historicMisses: string[] = [];
    for (const iso of isoDates) {
      if (cached.has(iso)) continue;
      (classify(iso, today) === 'forecast' ? forecastMisses : historicMisses).push(iso);
    }

    const fetched = new Map<string, CachedDay>();

    // Forecast and historic misses hit two different Open-Meteo endpoints and
    // write to disjoint keys of `fetched` — safe (and faster) to run concurrently
    // instead of paying both network round trips serially.
    const forecastFetch = forecastMisses.length === 0 ? Promise.resolve() : (async () => {
      try {
        const maxOffset = Math.max(...forecastMisses.map(iso =>
          Math.floor((new Date(iso).getTime() - new Date(today).getTime()) / 86_400_000),
        ));
        const readings = await fetchForecast(lat, lng, Math.min(16, maxOffset + 1));
        applyReadings(readings, forecastMisses, 'forecast', fetched);
      } catch {
        for (const iso of forecastMisses) fetched.set(iso, { type: 'unavailable' });
      }
    })();

    const historicFetch = historicMisses.length === 0 ? Promise.resolve() : (async () => {
      // Shift every historic miss back exactly 365 days, query that (contiguous)
      // range in one archive call, then map results back onto the *requested* dates.
      const shifted = historicMisses.map(iso => ({ requested: iso, source: addDaysISO(iso, -365) }));
      let sourceStart = shifted[0].source;
      let sourceEnd = shifted[0].source;
      for (const { source } of shifted) {
        if (source < sourceStart) sourceStart = source;
        if (source > sourceEnd) sourceEnd = source;
      }
      try {
        const readings = await fetchHistoricalRange(lat, lng, sourceStart, sourceEnd);
        const bySource = new Map(readings.map(r => [r.date, r]));
        for (const { requested, source } of shifted) {
          const reading = bySource.get(source);
          fetched.set(requested, reading
            ? { type: 'historic', tempMaxC: reading.tempMaxC, tempMinC: reading.tempMinC, weatherCode: reading.weatherCode }
            : { type: 'unavailable' });
        }
      } catch {
        for (const iso of historicMisses) fetched.set(iso, { type: 'unavailable' });
      }
    })();

    await Promise.all([forecastFetch, historicFetch]);

    // 3. Cache every freshly-fetched day (not 'unavailable' ones — worth retrying next request).
    try {
      const pipeline = redis.pipeline();
      let wrote = false;
      for (const [iso, day] of fetched) {
        if (day.type === 'unavailable') continue;
        pipeline.set(weatherDayKey(cityId, iso), JSON.stringify(day), 'EX', WEATHER_CACHE_TTL);
        wrote = true;
      }
      if (wrote) await pipeline.exec();
    } catch {
      // Non-fatal — serve the response even if the cache write failed.
    }

    // 4. Assemble the response in the originally-requested order.
    const days: WeatherResponseDay[] = isoDates.map(iso => {
      const day = cached.get(iso) ?? fetched.get(iso) ?? { type: 'unavailable' as const };
      return { date: isoToDMY(iso), ...day };
    });

    req.result = { days };
    next();
  };
}

function applyReadings(
  readings: WeatherDayReading[],
  requestedISODates: string[],
  type: 'forecast',
  out: Map<string, CachedDay>,
): void {
  const byDate = new Map(readings.map(r => [r.date, r]));
  for (const iso of requestedISODates) {
    const reading = byDate.get(iso);
    out.set(iso, reading
      ? { type, tempMaxC: reading.tempMaxC, tempMinC: reading.tempMinC, weatherCode: reading.weatherCode }
      : { type: 'unavailable' });
  }
}
