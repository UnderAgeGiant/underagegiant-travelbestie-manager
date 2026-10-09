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
import { redis }           from '../src/lib/redis';

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

  it('injects the cityIndex into the user message, never the system prompt', async () => {
    await request(app)
      .post('/ai/suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({
        preferences: 'historia y arte',
        cityIndex: [{ id: 'paris', name: 'Paris' }, { id: 'tokyo', name: 'Tokyo' }],
      });

    const systemMessage = create.mock.calls[0][0].messages[0].content as string;
    const userMessage   = create.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain('paris = Paris');
    expect(userMessage).toContain('tokyo = Tokyo');
    expect(systemMessage).not.toContain('paris = Paris');
    expect(systemMessage).not.toContain('<city_index>');
  });

  it('falls back to a generic instruction in the user message when no cityIndex is sent', async () => {
    await request(app)
      .post('/ai/suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: 'historia y arte' });

    const userMessage = create.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain('kebab-case');
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

  it('400s a description over 2000 chars before calling DeepSeek or spending karma', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    create.mockClear();

    const res = await request(app)
      .post('/ai/suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: 'x'.repeat(2001) });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('preferences');
    expect(create).not.toHaveBeenCalled();
    expect(karmaRepo.events.find((e: any) => e.reason === 'ai_suggest')).toBeUndefined();
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

  it('returns 500 when the model output breaks the response schema', async () => {
    create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ options: [] }) } }] });
    const res = await request(app)
      .post('/ai/suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: 'historia y arte' });
    expect(res.status).toBe(500);
  });

  it('stores the sanitized options under the caller\'s plan session', async () => {
    await request(app)
      .post('/ai/suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: 'historia y arte', planSessionId: 'session-1' });
    const setCalls = (redis.set as jest.Mock).mock.calls.filter(c => /^suggest:(?!history:|queue:)/.test(String(c[0])));
    expect(setCalls).toHaveLength(1);
    expect(JSON.parse(setCalls[0][1])).toHaveLength(2);
    expect(setCalls[0].slice(2)).toEqual(['EX', 86400]);
  });

  it('caps suggest output tokens', async () => {
    await request(app)
      .post('/ai/suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: 'historia y arte' });
    expect(create.mock.calls[0][0].max_tokens).toBe(8000);
  });
});

describe('POST /ai/suggest — batch of 8, served 2 at a time, never repeats (T1)', () => {
  const completion = (options: any[]) => ({
    choices: [{ message: { content: JSON.stringify({ options }) } }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
  const cities = ['paris', 'rome', 'tokyo', 'lima', 'cusco', 'quito', 'bogota', 'cairo'];
  const batch = () => cities.map((c, i) => ({ id: i + 1, title: `T${i + 1}`, summary: 'Resumen', highlights: ['h'], cityIds: [c] }));
  const cityIndex = cities.map(id => ({ id, name: id }));
  const store = new Map<string, string>();
  const body = { preferences: 'cultura', planSessionId: 's1', cityIndex };
  const titles = (res: any) => res.body.options.map((x: any) => x.title);

  beforeEach(() => {
    store.clear();
    create.mockReset().mockResolvedValue(completion(batch()));
    (redis.get as jest.Mock).mockReset().mockImplementation(async (k: string) => store.get(k) ?? null);
    (redis.set as jest.Mock).mockReset().mockImplementation(async (k: string, v: string) => { store.set(k, v); });
  });

  it('asks DeepSeek for 8 options with no avoid list, returns the first 2, then serves the rest from the queue', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    const post = () => request(app).post('/ai/suggest').set('Authorization', `Bearer ${token}`).send(body);

    const first = await post();
    expect(first.status).toBe(200);
    expect(titles(first)).toEqual(['T1', 'T2']);
    expect(first.body.options.map((x: any) => x.id)).toEqual([1, 2]);
    const userMessage = create.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain('exactamente 8');
    expect(userMessage).not.toContain('<ya_mostradas>');

    expect(titles(await post())).toEqual(['T3', 'T4']);
    const third = await post();
    expect(titles(third)).toEqual(['T5', 'T6']);
    expect(third.body.options.map((x: any) => x.id)).toEqual([1, 2]);
    expect(titles(await post())).toEqual(['T7', 'T8']);
    expect(create).toHaveBeenCalledTimes(1);

    await post();
    expect(create).toHaveBeenCalledTimes(2);
    expect(karmaRepo.events.filter((e: any) => e.reason === 'ai_suggest')).toHaveLength(5);
  });

  it('stores the served page as the plan-resolvable options for each click', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    await request(app).post('/ai/suggest').set('Authorization', `Bearer ${token}`).send(body);
    await request(app).post('/ai/suggest').set('Authorization', `Bearer ${token}`).send(body);
    const lastBatchKey = [...store.keys()].find(k => /^suggest:(?!history:|queue:)/.test(k))!;
    expect(JSON.parse(store.get(lastBatchKey)!).map((o: any) => o.title)).toEqual(['T3', 'T4']);
  });

  it('makes a fresh call instead of serving a single leftover option from the queue', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    create.mockResolvedValue(completion(batch().slice(0, 7)));
    const post = () => request(app).post('/ai/suggest').set('Authorization', `Bearer ${token}`).send(body);
    await post(); await post(); await post();          // T1-2, T3-4, T5-6 → T7 left alone
    expect(create).toHaveBeenCalledTimes(1);
    const res = await post();
    expect(create).toHaveBeenCalledTimes(2);
    expect(res.body.options).toHaveLength(1);          // fresh batch: only T7 is still unseen
    expect(titles(res)).toEqual(['T7']);
  });

  it('discards the queue when the inputs change', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    await request(app).post('/ai/suggest').set('Authorization', `Bearer ${token}`).send(body);
    await request(app).post('/ai/suggest').set('Authorization', `Bearer ${token}`).send({ ...body, preferences: 'playa' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('skips options already shown in the session when taking a fresh page', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    await request(app).post('/ai/suggest').set('Authorization', `Bearer ${token}`).send(body);
    const res = await request(app).post('/ai/suggest').set('Authorization', `Bearer ${token}`).send({ ...body, preferences: 'playa' });
    expect(titles(res)).toEqual(['T3', 'T4']);
  });

  it('still answers with 2 options when Redis is down', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    (redis.get as jest.Mock).mockRejectedValue(new Error('down'));
    (redis.set as jest.Mock).mockRejectedValue(new Error('down'));

    const res = await request(app).post('/ai/suggest').set('Authorization', `Bearer ${token}`).send(body);

    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['T1', 'T2']);
  });
});
