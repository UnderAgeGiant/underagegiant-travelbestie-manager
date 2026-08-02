import request from 'supertest';
import express from 'express';
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

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/auth/verify-otp.middleware', () => ({
  verifyOtpMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/lib/refresh-tokens', () => ({
  REFRESH_TTL:            86400,
  issueRefreshToken:      jest.fn().mockResolvedValue('mock-refresh-token'),
  validateAndRotate:      jest.fn(),
  revokeRefreshToken:     jest.fn().mockResolvedValue(undefined),
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
}));

const mockRedisGet = jest.fn().mockResolvedValue(null);

jest.mock('../src/lib/redis', () => ({
  redis: {
    get: (key: string) => mockRedisGet(key),
    set: jest.fn(),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn(),
  },
  planSessionKey: () => 'unused',
}));

const create = jest.fn();

jest.mock('../src/lib/deepseek', () => ({
  deepseekClient: { chat: { completions: { create: (...args: any[]) => create(...args) } } },
}));

function buildApp() {
  const karmaRepo = new StubKarmaRepository(100);
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(new StubUserRepository())));
  app.use('/ai',   createAiRouter(new AiController(), new KarmaController(karmaRepo)));
  app.use(errorHandler);
  return { app, karmaRepo };
}

async function getToken(app: express.Express): Promise<string> {
  const res = await request(app)
    .post('/auth/register')
    .send({ name: 'Tester', email: 'companion-suggest@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

const VALID_BODY = {
  cityId:            'paris',
  addedAttractionId: 'paris_0',
  checkIn:           '01/07/2026',
  checkOut:          '05/07/2026',
  existingAttractionIds: ['paris_0'],
  cityCatalog: [{ id: 'paris_0', name: 'Torre Eiffel' }, { id: 'paris_1', name: 'Louvre' }],
};

function mockDeepseekReturns(suggestion: Record<string, unknown>): void {
  create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(suggestion) } }] });
}

describe('POST /ai/suggest-companion', () => {
  let app: express.Express;
  let randomSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null); // not boosted by default
    mockDeepseekReturns({
      attractionId: 'paris_1', date: '02/07/2026', startTime: '10:00', endTime: '11:00',
      reason: 'Muchos viajeros visitan esto justo después.',
    });
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.05); // always rolls a hit (< 0.20 default chance)
    ({ app } = buildApp());
  });

  afterEach(() => { randomSpy.mockRestore(); });

  it('returns 401 with no Authorization header', async () => {
    const res = await request(app).post('/ai/suggest-companion').send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  it('rejects a body missing addedAttractionId', async () => {
    const token = await getToken(app);
    const { addedAttractionId, ...rest } = VALID_BODY;
    const res = await request(app)
      .post('/ai/suggest-companion')
      .set('Authorization', `Bearer ${token}`)
      .send(rest);
    expect(res.status).toBe(400);
  });

  it('never charges karma — 200 even with zero karma', async () => {
    const { karmaRepo, app: appNoKarma } = buildApp();
    karmaRepo.setScore(0);
    const token = await getToken(appNoKarma);
    const res = await request(appNoKarma)
      .post('/ai/suggest-companion')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(200);
  });

  it('returns 204 when the dice roll misses', async () => {
    randomSpy.mockReturnValue(0.99); // misses the default 0.20 chance
    const token = await getToken(app);
    const res = await request(app)
      .post('/ai/suggest-companion')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(204);
    expect(create).not.toHaveBeenCalled();
  });

  it('uses the boosted chance when companion:boost is set', async () => {
    mockRedisGet.mockResolvedValue('1');
    randomSpy.mockReturnValue(0.5); // misses default 0.20 but hits boosted 0.75
    const token = await getToken(app);
    const res = await request(app)
      .post('/ai/suggest-companion')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(200);
  });

  it('returns 200 with the parsed suggestion on a roll hit and valid response', async () => {
    const token = await getToken(app);
    const res = await request(app)
      .post('/ai/suggest-companion')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      attractionId: 'paris_1', date: '02/07/2026', startTime: '10:00', endTime: '11:00',
      reason: 'Muchos viajeros visitan esto justo después.',
    });
  });

  it('falls back to 204 when the model returns an attractionId outside the catalog', async () => {
    mockDeepseekReturns({ attractionId: 'not-in-catalog', date: '02/07/2026', startTime: '10:00', endTime: '11:00', reason: 'x' });
    const token = await getToken(app);
    const res = await request(app)
      .post('/ai/suggest-companion')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(204);
  });

  it('falls back to 204 when the model returns a slot colliding with existingSchedule', async () => {
    mockDeepseekReturns({ attractionId: 'paris_1', date: '02/07/2026', startTime: '10:30', endTime: '11:30', reason: 'x' });
    const token = await getToken(app);
    const res = await request(app)
      .post('/ai/suggest-companion')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...VALID_BODY,
        existingSchedule: [{ date: '02/07/2026', startTime: '10:00', endTime: '11:00' }],
      });
    expect(res.status).toBe(204);
  });

  it('falls back to 204 when the model returns a slot running past a booked departure', async () => {
    mockDeepseekReturns({ attractionId: 'paris_1', date: '03/07/2026', startTime: '14:00', endTime: '16:00', reason: 'x' });
    const token = await getToken(app);
    const res = await request(app)
      .post('/ai/suggest-companion')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...VALID_BODY,
        departureTimes: [{ date: '03/07/2026', time: '15:00' }],
      });
    expect(res.status).toBe(204);
  });

  it('builds the system prompt from the single-city catalog and fills the user message with the added attraction', async () => {
    const token = await getToken(app);
    await request(app)
      .post('/ai/suggest-companion')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);

    const systemMessage = create.mock.calls[0][0].messages[0].content as string;
    const userMessage   = create.mock.calls[0][0].messages[1].content as string;
    expect(systemMessage).toContain('paris_0=Torre Eiffel');
    expect(systemMessage).toContain('paris_1=Louvre');
    expect(userMessage).toContain('paris_0');
    expect(userMessage).toContain('paris');
  });
});
