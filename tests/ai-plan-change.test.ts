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

// ── Module mocks ─────────────────────────────────────────────────────────────

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

// In-memory Redis store shared across all mock calls within a test
const redisStore = new Map<string, string>();

jest.mock('../src/lib/redis', () => ({
  redis: {
    get:  jest.fn(async (key: string) => redisStore.get(key) ?? null),
    set:  jest.fn(async (key: string, value: string) => { redisStore.set(key, value); }),
  },
  planSessionKey: (userId: string, planSessionId: string) => {
    const hash = createHash('sha256').update(planSessionId).digest('hex');
    return `plan:${userId}:${hash}`;
  },
}));

jest.mock('../src/lib/deepseek', () => ({
  deepseekClient: {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({ title: 'Mock Plan', stops: [], transits: [] }),
            },
          }],
        }),
      },
    },
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_OPTION_A = {
  id: 1,
  title: 'Clásicos de Europa',
  summary: 'París, Roma y Barcelona en un viaje lleno de arte, historia y gastronomía.',
  highlights: ['París, Francia', 'Roma, Italia', 'Barcelona, España'],
};

const MOCK_OPTION_B = {
  id: 2,
  title: 'Japón y Corea del Sur',
  summary: 'Tokio, Kioto y Seúl: tecnología y tradición en perfecta armonía oriental.',
  highlights: ['Tokio, Japón', 'Kioto, Japón', 'Seúl, Corea del Sur'],
};

let karmaRepo: StubKarmaRepository;
let aiPlanRequestRepo: StubAiPlanRequestRepository;
let notificationRepo: StubNotificationRepository;

function buildApp() {
  const app = express();
  app.use(express.json());
  karmaRepo = new StubKarmaRepository();
  aiPlanRequestRepo = new StubAiPlanRequestRepository();
  notificationRepo = new StubNotificationRepository();
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository()), new StubHighlightRepository()));
  app.use('/ai',   createAiRouter(
    new AiController(),
    new KarmaController(karmaRepo),
    karmaRepo,
    aiPlanRequestRepo,
    notificationRepo,
  ));
  app.use(errorHandler);
  return app;
}

async function getToken(app: express.Express): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ name: 'Tester', email: 'plan@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

/** The background job runs fire-and-forget off the same microtask queue as the
 * test — waitUntil() outside the real Vercel runtime is a no-op wrapper, but the
 * wrapped promise still executes normally. Poll the status endpoint until it's
 * no longer 'pending' instead of asserting on the 202 response body directly. */
async function pollUntilDone(app: express.Express, token: string, requestId: string): Promise<request.Response> {
  for (let i = 0; i < 50; i++) {
    const res = await request(app)
      .get(`/ai/plan/${requestId}/status`)
      .set('Authorization', `Bearer ${token}`);
    if (res.body.status !== 'pending') return res;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('ai plan job never finished within the poll budget');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /ai/plan — async kickoff + change management', () => {
  let app: express.Express;
  let token: string;

  beforeEach(async () => {
    redisStore.clear();
    jest.clearAllMocks();
    app   = buildApp();
    token = await getToken(app);
  });

  const authHeader = (t: string) => ({ Authorization: `Bearer ${t}` });

  const planBody = (opt = MOCK_OPTION_A, sessionId?: string, prefOverride?: string) => ({
    selectedOption: opt,
    preferences:    prefOverride ?? 'viaje romántico con gastronomía',
    duration:       14,
    budget:         '1000 USD',
    startDate:      '15/07/2026',
    ...(sessionId ? { planSessionId: sessionId } : {}),
  });

  it('returns 202 with a requestId, then completes with changeInfo.type = new_session when no planSessionId', async () => {
    const kickoff = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody());

    expect(kickoff.status).toBe(202);
    expect(typeof kickoff.body.requestId).toBe('string');

    const done = await pollUntilDone(app, token, kickoff.body.requestId);
    expect(done.body.status).toBe('completed');
    expect(done.body.changeInfo).toMatchObject({ type: 'new_session' });
    expect(done.body.result.title).toBe('Mock Plan');
  });

  it('completes with changeInfo.type = new_session on first call with a planSessionId', async () => {
    const kickoff = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody(MOCK_OPTION_A, 'session-abc'));

    const done = await pollUntilDone(app, token, kickoff.body.requestId);
    expect(done.body.changeInfo).toMatchObject({
      type:                 'new_session',
      freeChangesUsed:      0,
      freeChangesRemaining: 3,
    });
  });

  it('completes with free_change on second call with minor option change', async () => {
    const sessionId = 'session-minor';

    const first = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody(MOCK_OPTION_A, sessionId));
    await pollUntilDone(app, token, first.body.requestId);

    const second = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody(MOCK_OPTION_A, sessionId, 'viaje romántico con gastronomía y museos'));
    const done = await pollUntilDone(app, token, second.body.requestId);

    expect(done.body.changeInfo).toMatchObject({
      type:                 'free_change',
      freeChangesUsed:      1,
      freeChangesRemaining: 2,
    });
  });

  it('completes with charged_change reason=major_change when options change drastically', async () => {
    const sessionId = 'session-major';

    const first = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody(MOCK_OPTION_A, sessionId));
    await pollUntilDone(app, token, first.body.requestId);

    const second = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody(MOCK_OPTION_B, sessionId, 'tecnología y naturaleza en asia'));
    const done = await pollUntilDone(app, token, second.body.requestId);

    expect(done.body.changeInfo).toMatchObject({ type: 'charged_change', reason: 'major_change' });
  });

  it('completes with charged_change reason=limit_reached after 3 free changes', async () => {
    const sessionId = 'session-limit';
    const tweakedPrefs = [
      'viaje romántico con gastronomía y museos',
      'viaje romántico con gastronomía, museos y arte',
      'viaje romántico con gastronomía, museos, arte y vino',
    ];

    const first = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody(MOCK_OPTION_A, sessionId));
    await pollUntilDone(app, token, first.body.requestId);

    for (const pref of tweakedPrefs) {
      const res = await request(app)
        .post('/ai/plan')
        .set(authHeader(token))
        .send(planBody(MOCK_OPTION_A, sessionId, pref));
      await pollUntilDone(app, token, res.body.requestId);
    }

    const last = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody(MOCK_OPTION_A, sessionId, 'viaje romántico con gastronomía, museos, arte, vino y playas'));
    const done = await pollUntilDone(app, token, last.body.requestId);

    expect(done.body.changeInfo).toMatchObject({ type: 'charged_change', reason: 'limit_reached' });
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/ai/plan').send(planBody());
    expect(res.status).toBe(401);
  });

  it('returns 400 when preferences is missing', async () => {
    const res = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send({ selectedOption: MOCK_OPTION_A });
    expect(res.status).toBe(400);
  });

  it('GET /ai/plan/:requestId/status returns 404 for a request belonging to another user', async () => {
    const kickoff = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody());
    await pollUntilDone(app, token, kickoff.body.requestId);

    const otherToken = await getToken2(app);
    const res = await request(app)
      .get(`/ai/plan/${kickoff.body.requestId}/status`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /ai/plan/:requestId/status returns 404 for a nonexistent requestId', async () => {
    const res = await request(app)
      .get('/ai/plan/00000000-0000-0000-0000-000000000000/status')
      .set(authHeader(token));
    expect(res.status).toBe(404);
  });

  async function getToken2(theApp: express.Express): Promise<string> {
    const res = await request(theApp)
      .post('/auth/register')
      .send({ name: 'Other', email: 'other@test.com', password: 'secret123', otp: '123456' });
    return res.body.token as string;
  }
});
