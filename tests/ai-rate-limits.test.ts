import request from 'supertest';
import express from 'express';

let incrCount = 0;
jest.mock('../src/lib/redis', () => ({
  redis: {
    incr:   jest.fn(async () => incrCount),
    expire: jest.fn(async () => 1),
    get:    jest.fn(async () => null),
    set:    jest.fn(async () => 'OK'),
  },
  planSessionKey: () => 'unused',
}));
jest.mock('../src/lib/deepseek', () => ({
  deepseekClient: { chat: { completions: { create: jest.fn() } } },
}));

import { StubKarmaRepository, StubAiPlanRequestRepository, StubNotificationRepository } from './helpers/stubs';
import { KarmaController } from '../src/controllers/karma.controller';
import { AiController } from '../src/controllers/ai.controller';
import { createAiRouter } from '../src/routes/ai.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { signToken } from '../src/lib/jwt';
import { redis } from '../src/lib/redis';

function buildApp() {
  const karmaRepo = new StubKarmaRepository();
  const app = express();
  app.use(express.json());
  app.use('/ai', createAiRouter(
    new AiController(), new KarmaController(karmaRepo), karmaRepo,
    new StubAiPlanRequestRepository(), new StubNotificationRepository(),
  ));
  app.use(errorHandler);
  return { app, karmaRepo };
}

const token = signToken({ userId: 'user-1', email: 'limits@test.com', name: 'Limits' });

const cases = [
  { path: '/ai/suggest', limit: 20, body: { preferences: 'arte' } },
  { path: '/ai/plan', limit: 20, body: {
    preferences: 'arte', planSessionId: 's1',
    selectedOption: { id: 1, title: 't', summary: 's', highlights: [] },
  } },
  { path: '/ai/suggest-attractions', limit: 30, body: {
    cityId: 'paris', checkIn: '01/07/2026', checkOut: '05/07/2026',
    cityCatalog: [{ id: 'paris_0', name: 'Torre Eiffel' }], isFollowUp: true,
  } },
];

describe('AI per-user rate limits', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(cases)('$path → 429 over $limit/hour, before any karma is spent', async ({ path, limit, body }) => {
    incrCount = limit + 1;
    const { app, karmaRepo } = buildApp();
    const res = await request(app).post(path).set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(429);
    expect(karmaRepo.events).toHaveLength(0);
    const key = (redis.incr as jest.Mock).mock.calls[0][0] as string;
    expect(key).toMatch(/^rl:ai-[a-z-]+:user-1$/);
    expect(redis.expire).toHaveBeenCalledWith(key, 3600, 'NX');
  });

  it.each(cases)('$path → not rate-limited at exactly $limit/hour', async ({ path, limit, body }) => {
    incrCount = limit;
    const { app } = buildApp();
    const res = await request(app).post(path).set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).not.toBe(429);
  });
});
