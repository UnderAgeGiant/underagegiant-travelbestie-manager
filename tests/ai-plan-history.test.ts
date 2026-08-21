import request from 'supertest';
import express from 'express';
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
jest.mock('../src/lib/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') },
  planSessionKey: (userId: string, sessionId: string) => `plan:${userId}:${sessionId}`,
}));

const deepseekMock = jest.fn();
jest.mock('../src/lib/deepseek', () => ({
  deepseekClient: { chat: { completions: { create: (...args: unknown[]) => deepseekMock(...args) } } },
}));

const MOCK_OPTION = {
  id: 1, title: 'Ruta Clásica por Europa', summary: 's',
  highlights: ['a'],
};

let karmaRepo: StubKarmaRepository;

function buildApp() {
  const app = express();
  app.use(express.json());
  karmaRepo = new StubKarmaRepository();
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository()), new StubHighlightRepository()));
  app.use('/ai',   createAiRouter(
    new AiController(),
    new KarmaController(karmaRepo),
    karmaRepo,
    new StubAiPlanRequestRepository(),
    new StubNotificationRepository(),
  ));
  app.use(errorHandler);
  return app;
}

async function getToken(app: express.Express): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ name: 'Tester', email: 'history@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

async function pollUntilDone(app: express.Express, token: string, requestId: string) {
  for (let i = 0; i < 50; i++) {
    const res = await request(app).get(`/ai/plan/${requestId}/status`).set('Authorization', `Bearer ${token}`);
    if (res.body.status !== 'pending') return res;
    await new Promise(r => setTimeout(r, 5));
  }
  throw new Error('never finished');
}

const planBody = () => ({
  selectedOption: MOCK_OPTION,
  preferences:    'viaje romántico',
  duration:       10,
  budget:         '1000 USD',
  startDate:      '15/07/2026',
});

describe('GET /ai/plan/history', () => {
  let app: express.Express;
  let token: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    app   = buildApp();
    token = await getToken(app);
  });

  it('lists a completed request with the generated title and params, excluding pending/other-user rows', async () => {
    deepseekMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ title: 'Mi Plan Europa', stops: [], transits: [] }) } }],
    });

    const kickoff = await request(app).post('/ai/plan').set('Authorization', `Bearer ${token}`).send(planBody());
    await pollUntilDone(app, token, kickoff.body.requestId);

    const res = await request(app).get('/ai/plan/history').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      status: 'completed',
      requestParams: { selectedOption: { title: 'Ruta Clásica por Europa' } },
      result: { title: 'Mi Plan Europa' },
    });
  });

  it('lists a failed request with the error and refunds karma', async () => {
    karmaRepo.setScore(5);
    deepseekMock.mockRejectedValue(new Error('DeepSeek unavailable'));

    const kickoff = await request(app).post('/ai/plan').set('Authorization', `Bearer ${token}`).send(planBody());
    await pollUntilDone(app, token, kickoff.body.requestId);

    const res = await request(app).get('/ai/plan/history').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ status: 'failed', karmaCharged: 1 });
    expect(res.body[0].error).toContain('DeepSeek unavailable');

    expect(karmaRepo.awarded).toEqual([
      { userId: expect.any(String), amount: 1, reason: 'ai_plan_refund', refId: kickoff.body.requestId },
    ]);
  });

  it('returns an empty array for a user with no AI plan history', async () => {
    const res = await request(app).get('/ai/plan/history').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
