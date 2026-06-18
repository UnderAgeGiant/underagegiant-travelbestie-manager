import request from 'supertest';
import express from 'express';
import { createHash } from 'crypto';
import {
  StubUserRepository,
  StubKarmaRepository,
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

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository())));
  app.use('/ai',   createAiRouter(
    new AiController(),
    new KarmaController(new StubKarmaRepository()),
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /ai/plan — change management', () => {
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

  it('returns 200 with changeInfo.type = new_session when no planSessionId', async () => {
    const res = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody());

    expect(res.status).toBe(200);
    expect(res.body.changeInfo).toMatchObject({ type: 'new_session' });
  });

  it('returns 200 with changeInfo.type = new_session on first call with a planSessionId', async () => {
    const res = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody(MOCK_OPTION_A, 'session-abc'));

    expect(res.status).toBe(200);
    expect(res.body.changeInfo).toMatchObject({
      type:                 'new_session',
      freeChangesUsed:      0,
      freeChangesRemaining: 3,
    });
  });

  it('returns free_change on second call with minor option change', async () => {
    const sessionId = 'session-minor';

    // First call — establishes session
    await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody(MOCK_OPTION_A, sessionId));

    // Second call — add a couple of words to preferences (minor tweak)
    const res = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody(MOCK_OPTION_A, sessionId, 'viaje romántico con gastronomía y museos'));

    expect(res.status).toBe(200);
    expect(res.body.changeInfo).toMatchObject({
      type:                 'free_change',
      freeChangesUsed:      1,
      freeChangesRemaining: 2,
    });
  });

  it('returns charged_change with reason=major_change when options change drastically', async () => {
    const sessionId = 'session-major';

    await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody(MOCK_OPTION_A, sessionId));

    // Switch to completely different destination option
    const res = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody(MOCK_OPTION_B, sessionId, 'tecnología y naturaleza en asia'));

    expect(res.status).toBe(200);
    expect(res.body.changeInfo).toMatchObject({
      type:   'charged_change',
      reason: 'major_change',
    });
  });

  it('returns charged_change with reason=limit_reached after 3 free changes', async () => {
    const sessionId = 'session-limit';
    const tweakedPrefs = [
      'viaje romántico con gastronomía y museos',
      'viaje romántico con gastronomía, museos y arte',
      'viaje romántico con gastronomía, museos, arte y vino',
    ];

    // First call — establishes session
    await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody(MOCK_OPTION_A, sessionId));

    // 3 free minor changes
    for (const pref of tweakedPrefs) {
      await request(app)
        .post('/ai/plan')
        .set(authHeader(token))
        .send(planBody(MOCK_OPTION_A, sessionId, pref));
    }

    // 4th minor change — should be charged (limit reached)
    const res = await request(app)
      .post('/ai/plan')
      .set(authHeader(token))
      .send(planBody(MOCK_OPTION_A, sessionId, 'viaje romántico con gastronomía, museos, arte, vino y playas'));

    expect(res.status).toBe(200);
    expect(res.body.changeInfo).toMatchObject({
      type:   'charged_change',
      reason: 'limit_reached',
    });
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
});
