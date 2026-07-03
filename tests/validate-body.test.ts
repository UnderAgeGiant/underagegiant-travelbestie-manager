import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validateBody } from '../src/middleware/validate-body.middleware';

function appWith(schema: z.ZodTypeAny) {
  const app = express();
  app.use(express.json());
  app.post('/t', validateBody(schema), (req, res) => res.json({ body: req.body }));
  return app;
}

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).optional(),
});

describe('validateBody', () => {
  it('passes valid input through and strips unknown keys', async () => {
    const res = await request(appWith(schema)).post('/t')
      .send({ email: 'a@test.com', age: 5, extra: 'nope' });
    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ email: 'a@test.com', age: 5 }); // 'extra' stripped
  });

  it('returns 400 with a joined error message on invalid input', async () => {
    const res = await request(appWith(schema)).post('/t').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  it('returns 400 when the body is missing a required field', async () => {
    const res = await request(appWith(schema)).post('/t').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('email');
  });
});
