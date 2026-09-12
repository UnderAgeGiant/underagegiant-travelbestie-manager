import request from 'supertest';
import express from 'express';
import {
  StubUserRepository, StubKarmaRepository, StubHighlightRepository,
  StubAiPlanRequestRepository, StubNotificationRepository,
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
jest.mock('../src/lib/deepseek', () => ({ deepseekClient: {} }));

function buildApp() {
  const karmaRepo = new StubKarmaRepository(100);
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository()), new StubHighlightRepository()));
  app.use('/ai', createAiRouter(
    new AiController(),
    new KarmaController(karmaRepo),
    karmaRepo,
    new StubAiPlanRequestRepository(),
    new StubNotificationRepository(),
  ));
  app.use(errorHandler);
  return { app, karmaRepo };
}

async function getToken(app: express.Express): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ name: 'Tester', email: 'ai-plan-refid@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

describe('POST /ai/plan — ai_plan karma event ref_id', () => {
  it('records ref_id equal to the requestId returned in the 202 response', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);

    const res = await request(app)
      .post('/ai/plan')
      .set('Authorization', `Bearer ${token}`)
      .send({
        preferences: 'romantic trip',
        selectedOption: { id: 1, title: 'Ruta Clásica', summary: 's', highlights: ['a'] },
      });

    expect(res.status).toBe(202);
    expect(res.body.requestId).toBeDefined();

    const aiPlanEvent = karmaRepo.events.find(e => e.reason === 'ai_plan');
    expect(aiPlanEvent).toBeDefined();
    expect(aiPlanEvent?.refId).toBe(res.body.requestId);
  });
});
