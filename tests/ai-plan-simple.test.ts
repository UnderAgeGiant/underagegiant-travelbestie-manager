import request from 'supertest';
import express from 'express';
import { createHash } from 'crypto';
import {
  StubUserRepository,
  StubKarmaRepository,
  StubHighlightRepository,
  StubAiPlanRequestRepository,
  StubNotificationRepository,
} from './helpers/stubs';
import { UserController }  from '../src/controllers/user.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { AiController }    from '../src/controllers/ai.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createAiRouter }   from '../src/routes/ai.routes';
import { errorHandler }     from '../src/middleware/error.middleware';
import { buildCitiesPlanOption } from '../src/lib/cities-plan-option';
import { loadSuggestedOptions } from '../src/lib/suggested-options-store';
import { capture } from '../src/lib/analytics';

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
  REFRESH_TTL:            86400,
  issueRefreshToken:      jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate:      jest.fn(),
  revokeRefreshToken:     jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/suggested-options-store', () => ({
  ...jest.requireActual('../src/lib/suggested-options-store'),
  loadSuggestedOptions: jest.fn(),
}));
jest.mock('../src/lib/analytics', () => ({
  ...jest.requireActual('../src/lib/analytics'),
  capture: jest.fn(),
}));

const redisStore = new Map<string, string>();
jest.mock('../src/lib/redis', () => ({
  redis: {
    get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => { redisStore.set(key, value); }),
  },
  planSessionKey: (userId: string, planSessionId: string) =>
    `plan:${userId}:${createHash('sha256').update(planSessionId).digest('hex')}`,
}));

jest.mock('../src/lib/deepseek', () => ({
  deepseekClient: { chat: { completions: { create: jest.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ title: 'Mock Plan', stops: [{ cityId: 'rome', checkIn: '01/07/2026', checkOut: '03/07/2026', selectedAttractions: [] }], transits: [] }) } }],
  }) } } },
}));

const loadMock = loadSuggestedOptions as jest.Mock;
const captureMock = capture as jest.Mock;

const CITIES = [{ id: 'rome', name: 'Rome' }, { id: 'florence', name: 'Florence' }];
const simpleBody = (over: Record<string, unknown> = {}) => ({
  flow: 'simple', cities: CITIES, duration: 5, startDate: '01/07/2026',
  cityCatalog: { rome: [{ id: 'rome_0', name: 'Colosseum' }] }, planSessionId: 'sess-simple', ...over,
});
const ADV_OPTION = { id: 1, title: 'Clásicos', summary: 'París y Roma', highlights: ['París', 'Roma'] };

let karmaRepo: StubKarmaRepository;
let aiPlanRequestRepo: StubAiPlanRequestRepository;

function buildApp(balance = 100) {
  const app = express();
  app.use(express.json());
  karmaRepo = new StubKarmaRepository(balance);
  aiPlanRequestRepo = new StubAiPlanRequestRepository();
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository()), new StubHighlightRepository()));
  app.use('/ai', createAiRouter(new AiController(), new KarmaController(karmaRepo), karmaRepo, aiPlanRequestRepo, new StubNotificationRepository()));
  app.use(errorHandler);
  return app;
}

async function getToken(app: express.Express): Promise<string> {
  const res = await request(app).post('/auth/register')
    .send({ name: 'Tester', email: 'simple@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

async function pollUntilDone(app: express.Express, token: string, requestId: string) {
  for (let i = 0; i < 50; i++) {
    const res = await request(app).get(`/ai/plan/${requestId}/status`).set('Authorization', `Bearer ${token}`);
    if (res.body.status !== 'pending') return res;
    await new Promise(r => setTimeout(r, 5));
  }
  throw new Error('job never finished');
}

const spent = () => karmaRepo.events.filter(e => e.delta < 0);
const startedEvents = () => captureMock.mock.calls.filter(c => c[1] === 'cta_ai_plan_started').map(c => c[2]);

describe('POST /ai/plan — simple flow (F84)', () => {
  let app: express.Express;
  let token: string;
  const post = (body: object) => request(app).post('/ai/plan').set('Authorization', `Bearer ${token}`).send(body);

  beforeEach(async () => {
    redisStore.clear();
    jest.clearAllMocks();
    loadMock.mockResolvedValue(null);
    app = buildApp();
    token = await getToken(app);
  });

  it('balance 9 → 202, spends 9 (ai_plan), stores flow + cities and the synthesized option, no suggest lookup', async () => {
    karmaRepo.setScore(9);
    const res = await post(simpleBody());
    expect(res.status).toBe(202);
    expect(spent()).toEqual([expect.objectContaining({ delta: -9, reason: 'ai_plan', refId: res.body.requestId })]);
    const row = await aiPlanRequestRepo.findById(res.body.requestId);
    expect(row!.karmaCharged).toBe(9);
    expect(row!.requestParams).toMatchObject({ flow: 'simple', cities: CITIES, cityIds: ['rome', 'florence'] });
    expect(row!.requestParams.selectedOption).toEqual(buildCitiesPlanOption(CITIES, 5));
    expect(loadMock).not.toHaveBeenCalled();
    await pollUntilDone(app, token, res.body.requestId);
  });

  it('balance 8 → 402 need 9, nothing spent', async () => {
    karmaRepo.setScore(8);
    const res = await post(simpleBody());
    expect(res.status).toBe(402);
    expect(res.body).toEqual({ error: 'Insufficient karma: need 9, have 8' });
    expect(spent()).toEqual([]);
  });

  it('re-run 5→6 days in the same session → free_change, 0 spent', async () => {
    const first = await post(simpleBody());
    await pollUntilDone(app, token, first.body.requestId);
    const second = await post(simpleBody({ duration: 6 }));
    expect(second.status).toBe(202);
    const done = await pollUntilDone(app, token, second.body.requestId);
    expect(done.body.changeInfo).toMatchObject({ type: 'free_change' });
    expect(spent()).toHaveLength(1);
    expect((await aiPlanRequestRepo.findById(second.body.requestId))!.karmaCharged).toBe(0);
  });

  it.each([
    ['with selectedOption',             simpleBody({ selectedOption: ADV_OPTION })],
    ['3 cities in 2 days',              simpleBody({ cities: [...CITIES, { id: 'venice', name: 'Venice' }], duration: 2 })],
    ['a cityCatalog key outside cities', simpleBody({ cityCatalog: { paris: [] } })],
    ['without cities',                  simpleBody({ cities: undefined })],
    ['duplicate cities',                simpleBody({ cities: [CITIES[0], CITIES[0]] })],
  ])('400 %s', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(spent()).toEqual([]);
  });

  it('3 cities in 2 days → error mentions cities_exceed_days', async () => {
    const res = await post(simpleBody({ cities: [...CITIES, { id: 'venice', name: 'Venice' }], duration: 2 }));
    expect(JSON.stringify(res.body)).toContain('cities_exceed_days');
  });

  it('simple without planSessionId → 400 planSessionId is required', async () => {
    const res = await post(simpleBody({ planSessionId: undefined }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'planSessionId is required' });
  });

  it('advanced without flow and no prior suggest → 409 (unchanged)', async () => {
    const res = await post({ selectedOption: ADV_OPTION, preferences: 'arte', duration: 5, planSessionId: 's-adv' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Suggested options expired — generate new suggestions' });
  });

  it('advanced → spends 1 and logs cta_ai_plan_started with flow advanced', async () => {
    loadMock.mockResolvedValue([ADV_OPTION]);
    const res = await post({ selectedOption: ADV_OPTION, preferences: 'arte', duration: 5, planSessionId: 's-adv' });
    expect(res.status).toBe(202);
    expect(spent()).toEqual([expect.objectContaining({ delta: -1, reason: 'ai_plan' })]);
    expect(startedEvents()).toEqual([{ flow: 'advanced', changeType: 'new_session', requestId: res.body.requestId }]);
    await pollUntilDone(app, token, res.body.requestId);
  });

  it('simple logs cta_ai_plan_started with flow simple', async () => {
    const res = await post(simpleBody());
    expect(startedEvents()).toEqual([{ flow: 'simple', changeType: 'new_session', requestId: res.body.requestId }]);
    await pollUntilDone(app, token, res.body.requestId);
  });
});
