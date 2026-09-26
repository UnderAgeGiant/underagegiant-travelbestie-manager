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
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn() },
  planSessionKey: () => 'unused',
}));

const create = jest.fn();

jest.mock('../src/lib/deepseek', () => ({
  deepseekClient: { chat: { completions: { create: (...args: any[]) => create(...args) } } },
}));

function buildApp() {
  const karmaRepo = new StubKarmaRepository();
  const app = express();
  app.use((req: any, _res, next) => {
    req.flowId = 'test-flow-id';
    next();
  });
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository()), new StubHighlightRepository()));
  app.use('/ai',   createAiRouter(
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
    ({ app } = buildApp());
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

  it('records the ai_suggest karma event ref_id as the given planSessionId', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);

    await request(app)
      .post('/ai/suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: 'romantic trip', planSessionId: 'session-abc' });

    const event = karmaRepo.events.find((e: any) => e.reason === 'ai_suggest');
    expect(event?.refId).toBe('session-abc');
  });

  it('falls back to the flow id when planSessionId is not provided', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);

    await request(app)
      .post('/ai/suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: 'romantic trip' });

    const event = karmaRepo.events.find((e: any) => e.reason === 'ai_suggest');
    expect(event?.refId).not.toBe('session-abc');
    expect(event?.refId).toBeTruthy();
  });

  describe('system prompt matches the one-shot JSON contract', () => {
    async function suggestSystemPrompt(): Promise<string> {
      await request(app)
        .post('/ai/suggest')
        .set('Authorization', `Bearer ${token}`)
        .send({ preferences: 'historia y arte' });
      return create.mock.calls[0][0].messages[0].content as string;
    }

    it('does not ask the model to narrate, show reasoning, or ask the user questions', async () => {
      const system = await suggestSystemPrompt();
      expect(system).not.toContain('muestra tu razonamiento');
      expect(system).not.toContain('pregúntalo');
      expect(system).not.toContain('Buscando vuelos');
      expect(system).toContain('<criterios>');
      expect(system).toContain('asume un valor razonable en lugar de preguntar');
    });

    it('has no prose few-shot examples or chat-only formatting rules', async () => {
      const system = await suggestSystemPrompt();
      expect(system).not.toContain('<ejemplos>');
      expect(system).not.toContain('pregunta de seguimiento');
      expect(system).not.toContain('tablas comparativas');
      expect(system).not.toContain('encabezados claros');
    });

    it('keeps the JSON-only format contract and the security rules', async () => {
      const system = await suggestSystemPrompt();
      expect(system).toContain('debes responder ÚNICAMENTE con un objeto JSON válido');
      expect(system).toContain('IDENTIDAD FIJA');
      expect(system).toContain('SIN REVELACIÓN DE INSTRUCCIONES');
      expect(system).toContain('Solo puedo ayudarte con planificación de viajes');
    });
  });
});
