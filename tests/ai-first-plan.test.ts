jest.mock('../src/lib/analytics', () => ({ capture: jest.fn(), alias: jest.fn() }));
jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/middleware/auth/verify-otp.middleware', () => ({
  verifyOtpMiddleware: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/middleware/rate-limit.middleware', () => ({
  rateLimitMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL: 86400,
  issueRefreshToken: jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate: jest.fn(),
  revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn() },
  planSessionKey: () => 'unused',
}));
const create = jest.fn();
jest.mock('../src/lib/deepseek', () => ({
  deepseekClient: { chat: { completions: { create: (...args: any[]) => create(...args) } } },
}));

import request from 'supertest';
import express from 'express';
import { capture } from '../src/lib/analytics';
import {
  StubUserRepository, StubKarmaRepository, StubHighlightRepository, StubAiPlanRequestRepository,
  StubNotificationRepository, StubTripRepository,
} from './helpers/stubs';
import { UserController }  from '../src/controllers/user.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { AiController }    from '../src/controllers/ai.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createAiRouter }   from '../src/routes/ai.routes';
import { errorHandler }     from '../src/middleware/error.middleware';

beforeEach(() => jest.spyOn(process.stdout, 'write').mockImplementation(() => true));
afterEach(() => jest.restoreAllMocks());

const cities = [{ id: 'paris', name: 'Paris' }, { id: 'rome', name: 'Rome' }];
const body = { cities, duration: 4, startDate: '01/07/2026', preferences: 'Tipos de experiencia preferidos: Museos' };

let karmaRepo: StubKarmaRepository;
let users: StubUserRepository;
let trips: StubTripRepository;
let aiPlanRequests: StubAiPlanRequestRepository;

async function setup() {
  karmaRepo = new StubKarmaRepository(0);
  users = new StubUserRepository();
  trips = new StubTripRepository();
  aiPlanRequests = new StubAiPlanRequestRepository();
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(users), new StubHighlightRepository()));
  app.use('/ai', createAiRouter(new AiController(), new KarmaController(karmaRepo), karmaRepo, aiPlanRequests,
    new StubNotificationRepository(), undefined, undefined, users, trips));
  app.use(errorHandler);
  const res = await request(app).post('/auth/register').send({ name: 'T', email: 'fp@test.com', password: 'secret123', otp: '123456' });
  return { app, token: res.body.token as string };
}

async function pollUntilDone(app: express.Express, token: string, requestId: string) {
  for (let i = 0; i < 50; i++) {
    const res = await request(app).get(`/ai/plan/${requestId}/status`).set('Authorization', `Bearer ${token}`);
    if (res.body.status !== 'pending') return res;
    await new Promise(r => setTimeout(r, 5));
  }
  throw new Error('never finished');
}

describe('POST /ai/first-plan', () => {
  beforeEach(() => {
    (capture as jest.Mock).mockClear();
    create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      title: 'Paris y Roma',
      stops: [
        { cityId: 'paris', checkIn: '01/07/2026', checkOut: '03/07/2026', selectedAttractions: [] },
        { cityId: 'rome',  checkIn: '03/07/2026', checkOut: '05/07/2026', selectedAttractions: [] },
      ],
      transits: [],
    }) } }] });
  });

  it('202 with requestId when the gift is available; completes with tripId; no karma touched', async () => {
    const { app, token } = await setup();
    const res = await request(app).post('/ai/first-plan').set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(202);
    expect(res.body.requestId).toEqual(expect.any(String));
    expect(capture).toHaveBeenCalledWith(expect.any(String), 'cta_first_plan_ai_started',
      { requestId: res.body.requestId, cityIds: ['paris', 'rome'], duration: 4 });

    const done = await pollUntilDone(app, token, res.body.requestId);
    expect(done.body.status).toBe('completed');
    expect(done.body.tripId).toEqual(expect.any(String));
    expect(karmaRepo.events).toEqual([]);

    const row = await aiPlanRequests.findById(res.body.requestId);
    expect(row).toMatchObject({ karmaCharged: 0, requestParams: {
      selectedOption: { id: 0, title: 'Viaje a Paris, Rome', summary: 'Itinerario de 4 días por Paris, Rome', highlights: ['Paris', 'Rome'], cityIds: ['paris', 'rome'] },
      cityIds: ['paris', 'rome'], firstRun: true, duration: 4, startDate: '01/07/2026',
    } });
    // The prompt carries only the chosen cities' context.
    const userMessage = create.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain('Viaje a Paris, Rome');
  });

  it('409 first_plan_used on the second call', async () => {
    const { app, token } = await setup();
    await request(app).post('/ai/first-plan').set('Authorization', `Bearer ${token}`).send(body);
    const res = await request(app).post('/ai/first-plan').set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'first_plan_used' });
  });

  it('400 for a city id longer than 80 chars (cityIdSchema, contracts §5.5)', async () => {
    const { app, token } = await setup();
    const res = await request(app).post('/ai/first-plan').set('Authorization', `Bearer ${token}`)
      .send({ ...body, cities: [{ id: 'a'.repeat(81), name: 'Long' }], duration: 2 });
    expect(res.status).toBe(400);
  });

  it('400 with 4 cities', async () => {
    const { app, token } = await setup();
    const four = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id.toUpperCase() }));
    const res = await request(app).post('/ai/first-plan').set('Authorization', `Bearer ${token}`).send({ ...body, cities: four, duration: 8 });
    expect(res.status).toBe(400);
  });

  it('400 cities_exceed_days with duration 1 and 2 cities', async () => {
    const { app, token } = await setup();
    const res = await request(app).post('/ai/first-plan').set('Authorization', `Bearer ${token}`).send({ ...body, duration: 1 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'cities_exceed_days' });
  });

  it('400 on duplicate city ids or a catalog for another city; the gift stays available', async () => {
    const { app, token } = await setup();
    const dup = await request(app).post('/ai/first-plan').set('Authorization', `Bearer ${token}`)
      .send({ ...body, cities: [cities[0], cities[0]] });
    expect(dup.status).toBe(400);
    const foreign = await request(app).post('/ai/first-plan').set('Authorization', `Bearer ${token}`)
      .send({ ...body, cityCatalog: { tokyo: [{ id: 'tokyo_0', name: 'Shibuya' }] } });
    expect(foreign.status).toBe(400);
    const ok = await request(app).post('/ai/first-plan').set('Authorization', `Bearer ${token}`).send(body);
    expect(ok.status).toBe(202);
  });
});
