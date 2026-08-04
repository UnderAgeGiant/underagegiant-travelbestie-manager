jest.mock('../src/lib/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), incr: jest.fn().mockResolvedValue(1), expire: jest.fn() },
}));

import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { createTripSchema } from '../src/schemas/trip.schemas';
import { aiSuggestSchema, aiPlanSchema, aiSuggestAttractionsSchema, suggestCompanionSchema } from '../src/schemas/ai.schemas';
import { createOrderSchema } from '../src/schemas/karma.schemas';
import { validateBody } from '../src/middleware/validate-body.middleware';

function appWith(schema: z.ZodTypeAny) {
  const app = express();
  app.use(express.json());
  app.post('/t', validateBody(schema), (_req, res) => res.json({ ok: true }));
  return app;
}

describe('trip/ai/karma schemas', () => {
  it('rejects a trip with no title', async () => {
    const res = await request(appWith(createTripSchema)).post('/t').send({ stops: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('title');
  });

  it('accepts a minimal valid trip', async () => {
    const res = await request(appWith(createTripSchema)).post('/t')
      .send({ title: 'My Trip', stops: [] });
    expect(res.status).toBe(200);
  });

  it('rejects ai/suggest with empty preferences', async () => {
    const res = await request(appWith(aiSuggestSchema)).post('/t').send({ preferences: '' });
    expect(res.status).toBe(400);
  });

  it('rejects ai/plan without selectedOption', async () => {
    const res = await request(appWith(aiPlanSchema)).post('/t').send({ preferences: 'beaches' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('selectedOption');
  });

  it('rejects ai/suggest cityIndex entries missing a name', async () => {
    const res = await request(appWith(aiSuggestSchema)).post('/t').send({
      preferences: 'historia y arte',
      cityIndex: [{ id: 'paris' }],
    });
    expect(res.status).toBe(400);
  });

  it('accepts ai/suggest with a valid cityIndex', async () => {
    const res = await request(appWith(aiSuggestSchema)).post('/t').send({
      preferences: 'historia y arte',
      cityIndex: [{ id: 'paris', name: 'Paris' }, { id: 'rome', name: 'Rome' }],
    });
    expect(res.status).toBe(200);
  });

  it('rejects ai/plan selectedOption.cityIds containing a non-string entry', async () => {
    const res = await request(appWith(aiPlanSchema)).post('/t').send({
      preferences: 'historia y arte',
      selectedOption: { id: 1, title: 'T', summary: 'S', highlights: [], cityIds: [123] },
    });
    expect(res.status).toBe(400);
  });

  it('accepts ai/plan selectedOption with valid cityIds', async () => {
    const res = await request(appWith(aiPlanSchema)).post('/t').send({
      preferences: 'historia y arte',
      selectedOption: { id: 1, title: 'T', summary: 'S', highlights: [], cityIds: ['paris', 'rome'] },
    });
    expect(res.status).toBe(200);
  });

  it('rejects ai/suggest-attractions without a cityCatalog', async () => {
    const res = await request(appWith(aiSuggestAttractionsSchema)).post('/t').send({
      cityId: 'paris', checkIn: '01/07/2026', checkOut: '05/07/2026',
    });
    expect(res.status).toBe(400);
  });

  it('accepts a valid ai/suggest-attractions body', async () => {
    const res = await request(appWith(aiSuggestAttractionsSchema)).post('/t').send({
      cityId: 'paris', checkIn: '01/07/2026', checkOut: '05/07/2026',
      existingAttractionIds: ['paris_0'],
      cityCatalog: [{ id: 'paris_1', name: 'Louvre' }],
    });
    expect(res.status).toBe(200);
  });

  it('accepts ai/suggest-attractions with existingSchedule and departureTimes', async () => {
    const res = await request(appWith(aiSuggestAttractionsSchema)).post('/t').send({
      cityId: 'paris', checkIn: '01/07/2026', checkOut: '05/07/2026',
      existingAttractionIds: ['paris_0'],
      existingSchedule: [{ date: '02/07/2026', startTime: '10:00', endTime: '11:00' }],
      departureTimes: [{ date: '03/07/2026', time: '15:00' }],
      cityCatalog: [{ id: 'paris_1', name: 'Louvre' }],
    });
    expect(res.status).toBe(200);
  });

  it('rejects ai/suggest-attractions when an existingSchedule entry is missing endTime', async () => {
    const res = await request(appWith(aiSuggestAttractionsSchema)).post('/t').send({
      cityId: 'paris', checkIn: '01/07/2026', checkOut: '05/07/2026',
      existingSchedule: [{ date: '02/07/2026', startTime: '10:00' }],
      cityCatalog: [{ id: 'paris_1', name: 'Louvre' }],
    });
    expect(res.status).toBe(400);
  });

  it('rejects ai/suggest-companion without addedAttractionId', async () => {
    const res = await request(appWith(suggestCompanionSchema)).post('/t').send({
      cityId: 'paris', checkIn: '01/07/2026', checkOut: '05/07/2026',
      cityCatalog: [{ id: 'paris_1', name: 'Louvre' }],
    });
    expect(res.status).toBe(400);
  });

  it('accepts a valid ai/suggest-companion body', async () => {
    const res = await request(appWith(suggestCompanionSchema)).post('/t').send({
      cityId: 'paris', addedAttractionId: 'paris_0', checkIn: '01/07/2026', checkOut: '05/07/2026',
      existingAttractionIds: ['paris_0'],
      cityCatalog: [{ id: 'paris_0', name: 'Torre Eiffel' }, { id: 'paris_1', name: 'Louvre' }],
    });
    expect(res.status).toBe(200);
  });

  it('accepts ai/suggest-companion with existingSchedule and departureTimes', async () => {
    const res = await request(appWith(suggestCompanionSchema)).post('/t').send({
      cityId: 'paris', addedAttractionId: 'paris_0', checkIn: '01/07/2026', checkOut: '05/07/2026',
      existingSchedule: [{ date: '02/07/2026', startTime: '10:00', endTime: '11:00' }],
      departureTimes: [{ date: '03/07/2026', time: '15:00' }],
      cityCatalog: [{ id: 'paris_1', name: 'Louvre' }],
    });
    expect(res.status).toBe(200);
  });

  it('rejects create-order without packageId', async () => {
    const res = await request(appWith(createOrderSchema)).post('/t').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('packageId');
  });
});
