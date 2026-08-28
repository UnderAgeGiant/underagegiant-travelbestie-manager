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

const MOCK_OPTION = { id: 1, title: 'Ruta Clásica por Europa', summary: 's', highlights: ['a'] };

let karmaRepo: StubKarmaRepository;
// Exposed (not just constructed inline) so tests can inspect a row directly
// after a DELETE call — verifying a failed row's soft-delete actually keeps
// it in storage requires reading it back through the repository itself, not
// just through GET /ai/plan/history (which excludes it either way).
let aiPlanRequests: StubAiPlanRequestRepository;

function buildApp() {
  const app = express();
  app.use(express.json());
  karmaRepo = new StubKarmaRepository();
  aiPlanRequests = new StubAiPlanRequestRepository();
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository()), new StubHighlightRepository()));
  app.use('/ai',   createAiRouter(
    new AiController(),
    new KarmaController(karmaRepo),
    karmaRepo,
    aiPlanRequests,
    new StubNotificationRepository(),
  ));
  app.use(errorHandler);
  return app;
}

async function getToken(app: express.Express, email: string): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ name: 'Tester', email, password: 'secret123', otp: '123456' });
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

describe('DELETE /ai/plan/:requestId', () => {
  let app: express.Express;
  let token: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    app   = buildApp();
    token = await getToken(app, 'discard@test.com');
  });

  it('deletes a completed request and removes it from history', async () => {
    deepseekMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ title: 'Mi Plan Europa', stops: [], transits: [] }) } }],
    });
    const kickoff = await request(app).post('/ai/plan').set('Authorization', `Bearer ${token}`).send(planBody());
    await pollUntilDone(app, token, kickoff.body.requestId);

    const del = await request(app).delete(`/ai/plan/${kickoff.body.requestId}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const history = await request(app).get('/ai/plan/history').set('Authorization', `Bearer ${token}`);
    expect(history.body).toEqual([]);
  });

  it('discards (soft-deletes) a failed request too (the "Descartar" path) — hidden from history', async () => {
    deepseekMock.mockRejectedValue(new Error('DeepSeek unavailable'));
    const kickoff = await request(app).post('/ai/plan').set('Authorization', `Bearer ${token}`).send(planBody());
    await pollUntilDone(app, token, kickoff.body.requestId);

    const del = await request(app).delete(`/ai/plan/${kickoff.body.requestId}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const history = await request(app).get('/ai/plan/history').set('Authorization', `Bearer ${token}`);
    expect(history.body).toEqual([]);
  });

  it('keeps a discarded failed row in storage, with its error preserved, for later analysis', async () => {
    deepseekMock.mockRejectedValue(new Error('DeepSeek unavailable'));
    const kickoff = await request(app).post('/ai/plan').set('Authorization', `Bearer ${token}`).send(planBody());
    await pollUntilDone(app, token, kickoff.body.requestId);

    await request(app).delete(`/ai/plan/${kickoff.body.requestId}`).set('Authorization', `Bearer ${token}`);

    const stillThere = await aiPlanRequests.findById(kickoff.body.requestId);
    expect(stillThere).not.toBeNull();
    expect(stillThere?.discardedAt).toBeTruthy();
    expect(stillThere?.errorMessage).toBe('DeepSeek unavailable');
  });

  it('hard-deletes a completed request — the row is actually gone, not just hidden', async () => {
    deepseekMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ title: 'Mi Plan Europa', stops: [], transits: [] }) } }],
    });
    const kickoff = await request(app).post('/ai/plan').set('Authorization', `Bearer ${token}`).send(planBody());
    await pollUntilDone(app, token, kickoff.body.requestId);

    await request(app).delete(`/ai/plan/${kickoff.body.requestId}`).set('Authorization', `Bearer ${token}`);

    const gone = await aiPlanRequests.findById(kickoff.body.requestId);
    expect(gone).toBeNull();
  });

  it('404s for a nonexistent requestId', async () => {
    const res = await request(app)
      .delete('/ai/plan/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('AI plan request not found');
  });

  it('404s when the request belongs to a different user (anti-enumeration) and leaves the row intact', async () => {
    deepseekMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ title: 'Mi Plan Europa', stops: [], transits: [] }) } }],
    });
    const kickoff = await request(app).post('/ai/plan').set('Authorization', `Bearer ${token}`).send(planBody());
    await pollUntilDone(app, token, kickoff.body.requestId);

    const otherToken = await getToken(app, 'other@test.com');
    const res = await request(app)
      .delete(`/ai/plan/${kickoff.body.requestId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);

    const history = await request(app).get('/ai/plan/history').set('Authorization', `Bearer ${token}`);
    expect(history.body).toHaveLength(1);
  });

  it('401s without a token', async () => {
    const res = await request(app).delete('/ai/plan/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(401);
  });
});
