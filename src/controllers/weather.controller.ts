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
      if (cachedRaw[i]) cached.set(iso, JSON.parse(cachedRaw[i]!));
    });

    // 2. Split the misses by forecast-eligibility.
    const misses = isoDates.filter(iso => !cached.has(iso));
    const forecastMisses = misses.filter(iso => classify(iso, today) === 'forecast');
    const historicMisses = misses.filter(iso => classify(iso, today) === 'historic');

    const fetched = new Map<string, CachedDay>();

    if (forecastMisses.length > 0) {
      try {
        const maxOffset = Math.max(...forecastMisses.map(iso =>
          Math.floor((new Date(iso).getTime() - new Date(today).getTime()) / 86_400_000),
        ));
        const readings = await fetchForecast(lat, lng, Math.min(16, maxOffset + 1));
        applyReadings(readings, forecastMisses, 'forecast', fetched);
      } catch {
        for (const iso of forecastMisses) fetched.set(iso, { type: 'unavailable' });
      }
    }

    if (historicMisses.length > 0) {
      // Shift every historic miss back exactly 365 days, query that (contiguous)
      // range in one archive call, then map results back onto the *requested* dates.
      const shifted = historicMisses.map(iso => ({ requested: iso, source: addDaysISO(iso, -365) }));
      const sourceStart = shifted.reduce((min, s) => s.source < min ? s.source : min, shifted[0].source);
      const sourceEnd   = shifted.reduce((max, s) => s.source > max ? s.source : max, shifted[0].source);
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
    }

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
