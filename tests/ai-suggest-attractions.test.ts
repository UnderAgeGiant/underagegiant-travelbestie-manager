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
    .send({ name: 'Tester', email: 'city-suggest@test.com', password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

const VALID_BODY = {
  cityId:   'paris',
  checkIn:  '01/07/2026',
  checkOut: '05/07/2026',
  existingAttractionIds: ['paris_0'],
  cityCatalog: [{ id: 'paris_0', name: 'Torre Eiffel' }, { id: 'paris_1', name: 'Louvre' }],
};

describe('POST /ai/suggest-attractions', () => {
  let app: express.Express;
  let karmaRepo: StubKarmaRepository;
  let token: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    create.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            suggestions: [
              { attractionId: 'paris_1', date: '02/07/2026', startTime: '10:00', endTime: '12:00', reason: 'Cerca de tu hotel y del resto del itinerario.' },
            ],
          }),
        },
      }],
    });
    ({ app, karmaRepo } = buildApp());
    token = await getToken(app);
  });

  it('returns 401 with no Authorization header', async () => {
    const res = await request(app).post('/ai/suggest-attractions').send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  it('returns 402 when the user has less than 2 karma', async () => {
    karmaRepo.setScore(1);
    const res = await request(app)
      .post('/ai/suggest-attractions')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(402);
  });

  it('skips the karma check entirely when isFollowUp is true, even with insufficient karma', async () => {
    karmaRepo.setScore(0);
    const res = await request(app)
      .post('/ai/suggest-attractions')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_BODY, isFollowUp: true });
    expect(res.status).toBe(200);
  });

  it('still requires and spends 2 karma when isFollowUp is false or omitted', async () => {
    karmaRepo.setScore(1);
    const res = await request(app)
      .post('/ai/suggest-attractions')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_BODY, isFollowUp: false });
    expect(res.status).toBe(402);
  });

  it('rejects a body missing cityCatalog', async () => {
    const { cityCatalog, ...rest } = VALID_BODY;
    const res = await request(app)
      .post('/ai/suggest-attractions')
      .set('Authorization', `Bearer ${token}`)
      .send(rest);
    expect(res.status).toBe(400);
  });

  it('builds the system prompt from the single-city catalog and fills the user message with dates/existing IDs', async () => {
    await request(app)
      .post('/ai/suggest-attractions')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);

    const systemMessage = create.mock.calls[0][0].messages[0].content as string;
    const userMessage   = create.mock.calls[0][0].messages[1].content as string;
    expect(systemMessage).toContain('paris_0=Torre Eiffel');
    expect(systemMessage).toContain('paris_1=Louvre');
    expect(userMessage).toContain('paris');
    expect(userMessage).toContain('paris_0');
    expect(userMessage).toContain('01/07/2026');
    expect(userMessage).toContain('05/07/2026');
  });

  it('falls back to "ninguna" in the user message when existingAttractionIds is empty', async () => {
    const { existingAttractionIds, ...rest } = VALID_BODY;
    await request(app)
      .post('/ai/suggest-attractions')
      .set('Authorization', `Bearer ${token}`)
      .send(rest);

    const userMessage = create.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain('ninguna');
  });

  it('includes the existing schedule and transit departure times in the user message, with explicit no-overlap/no-after-departure rules', async () => {
    await request(app)
      .post('/ai/suggest-attractions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...VALID_BODY,
        existingSchedule: [{ date: '02/07/2026', startTime: '10:00', endTime: '11:00' }],
        departureTimes: [{ date: '03/07/2026', time: '15:00' }],
      });

    const userMessage = create.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain('02/07/2026: 10:00–11:00');
    expect(userMessage).toContain('03/07/2026 a las 15:00');
    expect(userMessage).toContain('NINGUNA sugerencia puede superponerse ni colisionar');
    expect(userMessage).toContain('NINGUNA sugerencia puede coincidir con la hora de viaje ni ser posterior a ella');
    expect(userMessage).toContain('debe completarse ANTES de la hora de salida');
  });

  it('falls back to "no schedule / no transport" messages when existingSchedule and departureTimes are omitted', async () => {
    await request(app)
      .post('/ai/suggest-attractions')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);

    const userMessage = create.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain('no tiene otras atracciones con horario definido en esta parada');
    expect(userMessage).toContain('no tiene transporte reservado saliendo de esta ciudad todavía');
  });

  it('returns 200 with the parsed suggestions on success', async () => {
    const res = await request(app)
      .post('/ai/suggest-attractions')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([
      { attractionId: 'paris_1', date: '02/07/2026', startTime: '10:00', endTime: '12:00', reason: 'Cerca de tu hotel y del resto del itinerario.' },
    ]);
  });
});
