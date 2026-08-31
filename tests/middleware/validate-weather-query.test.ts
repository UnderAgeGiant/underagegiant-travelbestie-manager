import express from 'express';
import request from 'supertest';
import { validateWeatherQuery } from '../../src/middleware/weather/validate-weather-query.middleware';
import { errorHandler } from '../../src/middleware/error.middleware';

function buildApp() {
  const app = express();
  app.get('/weather', validateWeatherQuery, (req, res) => {
    res.json({ ok: true, weatherQuery: req.weatherQuery });
  });
  app.use(errorHandler);
  return app;
}

describe('validateWeatherQuery', () => {
  it('accepts a valid cityId + range and computes isoDates', async () => {
    const res = await request(buildApp()).get('/weather').query({
      cityId: 'paris', checkIn: '05/03/2026', checkOut: '07/03/2026',
    });
    expect(res.status).toBe(200);
    expect(res.body.weatherQuery).toEqual({
      cityId: 'paris', checkIn: '05/03/2026', checkOut: '07/03/2026',
      isoDates: ['2026-03-05', '2026-03-06', '2026-03-07'],
    });
  });

  it('400s on a missing cityId', async () => {
    const res = await request(buildApp()).get('/weather').query({ checkIn: '05/03/2026', checkOut: '07/03/2026' });
    expect(res.status).toBe(400);
  });

  it('400s on an unknown cityId', async () => {
    const res = await request(buildApp()).get('/weather').query({
      cityId: 'not-a-real-city', checkIn: '05/03/2026', checkOut: '07/03/2026',
    });
    expect(res.status).toBe(400);
  });

  it('400s on a malformed date', async () => {
    const res = await request(buildApp()).get('/weather').query({
      cityId: 'paris', checkIn: '2026-03-05', checkOut: '07/03/2026',
    });
    expect(res.status).toBe(400);
  });

  it('400s on a shape-valid but non-existent calendar date (e.g. 31/02)', async () => {
    const res = await request(buildApp()).get('/weather').query({
      cityId: 'paris', checkIn: '31/02/2026', checkOut: '31/02/2026',
    });
    expect(res.status).toBe(400);
  });

  it('400s when checkIn is after checkOut', async () => {
    const res = await request(buildApp()).get('/weather').query({
      cityId: 'paris', checkIn: '10/03/2026', checkOut: '07/03/2026',
    });
    expect(res.status).toBe(400);
  });

  it('400s when the range exceeds 31 days', async () => {
    const res = await request(buildApp()).get('/weather').query({
      cityId: 'paris', checkIn: '01/01/2026', checkOut: '15/02/2026',
    });
    expect(res.status).toBe(400);
  });
});
