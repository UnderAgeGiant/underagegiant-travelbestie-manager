import request from 'supertest';
import express from 'express';
import {
  StubUserRepository,
  StubKarmaRepository,
  StubHighlightRepository,
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
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn() },
  planSessionKey: () => 'unused',
}));

const create = jest.fn();

jest.mock('../src/lib/deepseek', () => ({
  deepseekClient: { chat: { completions: { create: (...args: any[]) => create(...args) } } },
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository()), new StubHighlightRepository()));
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
    .send({ name: 'Tester', email: 'suggest@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

describe('POST /ai/suggest', () => {
  let app: express.Express;
  let token: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    create.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            options: [
              { id: 1, title: 'Clásicos de Europa', summary: 'Resumen 1', highlights: ['París'], cityIds: ['paris'] },
              { id: 2, title: 'Asia Oriental',       summary: 'Resumen 2', highlights: ['Tokio'], cityIds: ['tokyo'] },
            ],
          }),
        },
      }],
    });
    app   = buildApp();
    token = await getToken(app);
  });

  it('injects the cityIndex into the system prompt as {cityIndexBlock}', async () => {
    await request(app)
      .post('/ai/suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({
        preferences: 'historia y arte',
        cityIndex: [{ id: 'paris', name: 'Paris' }, { id: 'tokyo', name: 'Tokyo' }],
      });

    const systemMessage = create.mock.calls[0][0].messages[0].content as string;
    expect(systemMessage).toContain('paris = Paris');
    expect(systemMessage).toContain('tokyo = Tokyo');
  });

  it('falls back to a generic instruction when no cityIndex is sent', async () => {
    await request(app)
      .post('/ai/suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: 'historia y arte' });

    const systemMessage = create.mock.calls[0][0].messages[0].content as string;
    expect(systemMessage).toContain('kebab-case');
  });

  it('returns cityIds per option, passed through unchanged from the model response', async () => {
    const res = await request(app)
      .post('/ai/suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: 'historia y arte' });

    expect(res.status).toBe(200);
    expect(res.body.options[0].cityIds).toEqual(['paris']);
    expect(res.body.options[1].cityIds).toEqual(['tokyo']);
  });
});
