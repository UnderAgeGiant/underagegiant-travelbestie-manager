import { Router } from 'express';
import { WeatherController } from '../controllers/weather.controller';
import { validateWeatherQuery } from '../middleware/weather/validate-weather-query.middleware';
import { applyWeatherEtag } from '../middleware/weather/apply-weather-etag.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { respond } from '../middleware/respond.middleware';

export function createWeatherRouter(weather: WeatherController): Router {
  const router = Router();

  router.get('/',
    // Wide on purpose: public/no-auth, and a single page load can fire one call per
    // stop in a trip. Per-day results are Redis-cached for 12h (WEATHER_CACHE_TTL),
    // so a caller riding well past this ceiling still only rarely reaches Open-Meteo —
    // this bound exists to stop outright abuse, not to throttle normal usage.
    rateLimitMiddleware({ keyPrefix: 'rl:weather', windowSeconds: 60, maxRequests: 300 }),
    validateWeatherQuery,
    weather.get,
    applyWeatherEtag,
    respond(200),
  );

  return router;
}
