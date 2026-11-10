import { Request, Response, NextFunction } from 'express';
import { CITY_COORDS } from '../../data/city-coords';
import { getUsdRates } from '../../lib/fx';
import { dmyToISO, iterateISODates } from '../../lib/weather-dates';
import { ItineraryContext } from '../../lib/itinerary/types';
import { WeatherResponseDay } from '../../types';

const MAX_WEATHER_DAYS = 31; // same span limit as GET /weather (§12)

// Lazy: lib/weather-days pulls in the shared Redis client at import time.
function weatherDays(cityId: string, isoDates: string[]): Promise<WeatherResponseDay[]> {
  return (require('../../lib/weather-days') as typeof import('../../lib/weather-days')).getWeatherDays(cityId, isoDates);
}

async function usdRateFor(currency?: string): Promise<number | null> {
  if (!currency || currency === 'USD') return null;
  try {
    return (await getUsdRates()).rates[currency] ?? null;
  } catch {
    return null;
  }
}

/** Loads per-stop weather and the viewer's FX rate for the itinerary export. Never fails the request. */
export async function loadItineraryContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const stops = req.trip!.stops;
  const weather: ItineraryContext['weather'] = {};
  // allSettled: a rejected stop keeps its [] — weather is best-effort.
  await Promise.allSettled(stops.map(async (stop, i) => {
    weather[String(i)] = [];
    if (!CITY_COORDS[stop.cityId]) return;
    const isoDates = iterateISODates(dmyToISO(stop.checkIn), dmyToISO(stop.checkOut));
    if (isoDates.length === 0 || isoDates.length > MAX_WEATHER_DAYS) return;
    weather[String(i)] = await weatherDays(stop.cityId, isoDates);
  }));

  req.itineraryContext = { weather, usdRate: await usdRateFor(req.body?.currency), exportedAt: new Date() };
  next();
}
