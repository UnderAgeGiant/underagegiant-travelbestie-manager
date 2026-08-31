import request from 'supertest';
import express from 'express';
import { createWeatherRouter } from '../src/routes/weather.routes';
import { WeatherController } from '../src/controllers/weather.controller';
import { errorHandler } from '../src/middleware/error.middleware';

const mockRedis = { mget: jest.fn(), pipeline: jest.fn() };
jest.mock('../src/lib/redis', () => ({
  redis: {
    mget: (...args: any[]) => mockRedis.mget(...args),
    pipeline: (...args: any[]) => mockRedis.pipeline(...args),
  },
  weatherDayKey: (cityId: string, isoDate: string) => `weather:${cityId}:${isoDate}`,
  WEATHER_CACHE_TTL: 43200,
}));

jest.mock('../src/middleware/rate-limit.middleware', () => ({
  rateLimitMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));

const mockFetchForecast = jest.fn();
jest.mock('../src/lib/open-meteo', () => ({
  fetchForecast: (...args: any[]) => mockFetchForecast(...args),
  fetchHistoricalRange: jest.fn(),
}));

// Fix "today" so the requested 30/08/2026 date deterministically classifies as
// forecast-eligible regardless of the real wall-clock date this suite runs on
// (mirrors tests/weather-controller.test.ts's own fixed-today mock).
jest.mock('../src/lib/weather-dates', () => {
  const actual = jest.requireActual('../src/lib/weather-dates');
  return { ...actual, todayISO: () => '2026-08-30' };
});

function buildApp() {
  const app = express();
  app.use('/weather', createWeatherRouter(new WeatherController()));
  app.use(errorHandler);
  return app;
}

describe('GET /weather', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.pipeline.mockReturnValue({ set: jest.fn(), exec: jest.fn().mockResolvedValue([]) });
  });

  it('400s on an unknown cityId', async () => {
    const res = await request(buildApp()).get('/weather').query({
      cityId: 'nowhere', checkIn: '01/01/2026', checkOut: '02/01/2026',
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 with a days array and an ETag header on first call', async () => {
    mockRedis.mget.mockResolvedValue([null]);
    mockFetchForecast.mockResolvedValue([{ date: '2026-08-30', tempMaxC: 23, tempMinC: 14, weatherCode: 3 }]);

    const res = await request(buildApp()).get('/weather').query({
      cityId: 'paris', checkIn: '30/08/2026', checkOut: '30/08/2026',
    });

    expect(res.status).toBe(200);
    expect(res.headers['etag']).toBeTruthy();
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.days).toEqual([{ date: '30/08/2026', type: 'forecast', tempMaxC: 23, tempMinC: 14, weatherCode: 3 }]);
  });

  it('returns 304 with no body when If-None-Match matches the prior ETag', async () => {
    mockRedis.mget.mockResolvedValue([null]);
    mockFetchForecast.mockResolvedValue([{ date: '2026-08-30', tempMaxC: 23, tempMinC: 14, weatherCode: 3 }]);
    const first = await request(buildApp()).get('/weather').query({
      cityId: 'paris', checkIn: '30/08/2026', checkOut: '30/08/2026',
    });
    const etag = first.headers['etag'];

    mockRedis.mget.mockResolvedValue([JSON.stringify({ type: 'forecast', tempMaxC: 23, tempMinC: 14, weatherCode: 3 })]);
    const second = await request(buildApp())
      .get('/weather')
      .set('If-None-Match', etag)
      .query({ cityId: 'paris', checkIn: '30/08/2026', checkOut: '30/08/2026' });

    expect(second.status).toBe(304);
    expect(second.body).toEqual({});
  });
});
