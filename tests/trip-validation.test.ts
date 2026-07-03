jest.mock('../src/lib/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), incr: jest.fn().mockResolvedValue(1), expire: jest.fn() },
}));

import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { createTripSchema } from '../src/schemas/trip.schemas';
import { aiSuggestSchema, aiPlanSchema } from '../src/schemas/ai.schemas';
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

  it('rejects create-order without packageId', async () => {
    const res = await request(appWith(createOrderSchema)).post('/t').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('packageId');
  });
});
