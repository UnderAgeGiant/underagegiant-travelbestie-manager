import request from 'supertest';
import express from 'express';
import {
  StubUserRepository, StubKarmaRepository, StubHighlightRepository, StubAiPlanRequestRepository, StubNotificationRepository,
} from './helpers/stubs';
import { UserController }  from '../src/controllers/user.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { AiController }    from '../src/controllers/ai.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createAiRouter }   from '../src/routes/ai.routes';
import { errorHandler }     from '../src/middleware/error.middleware';
import { composeCitiesPreferences, restrictToCities } from '../src/lib/suggest-cities';
import { suggestInputsHash } from '../src/lib/suggest-history';

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
const create = jest.fn();
jest.mock('../src/lib/deepseek', () => ({
  deepseekClient: { chat: { completions: { create: (...args: any[]) => create(...args) } } },
}));

const index = [{ id: 'paris', name: 'Paris' }, { id: 'rome', name: 'Rome' }, { id: 'tokyo', name: 'Tokyo' }];
const opt = (id: number, cityIds: string[]) => ({ id, title: `T${id}`, summary: 's', highlights: ['h'], cityIds });

describe('composeCitiesPreferences', () => {
  it('names the chosen cities and appends the interests', () => {
    expect(composeCitiesPreferences(['paris', 'rome'], index, 'Museos')).toBe(
      'Destinos elegidos (usa exactamente estas ciudades en cada opción; varía el orden, los días por ciudad y el enfoque): Paris, Rome.\nMuseos',
    );
  });

  it('omits the interests line when empty', () => {
    expect(composeCitiesPreferences(['rome'], index, '  ')).toBe(
      'Destinos elegidos (usa exactamente estas ciudades en cada opción; varía el orden, los días por ciudad y el enfoque): Rome.',
    );
  });
});

describe('restrictToCities', () => {
  it('drops an option naming a city outside the set', () => {
    const kept = restrictToCities([opt(1, ['paris', 'rome']), opt(2, ['paris', 'tokyo'])], ['paris', 'rome']);
    expect(kept.map(o => o.id)).toEqual([1]);
  });

  it('returns unfiltered when none survive', () => {
    const all = [opt(1, ['tokyo']), opt(2, [])];
    expect(restrictToCities(all, ['paris'])).toEqual(all);
  });
});

describe('suggestInputsHash', () => {
  it('changes when cityIds change', () => {
    const base = { preferences: undefined, duration: 5, cityIndex: index };
    expect(suggestInputsHash({ ...base, cityIds: ['paris'] })).not.toBe(suggestInputsHash({ ...base, cityIds: ['rome'] }));
  });
});

describe('POST /ai/suggest — cities mode', () => {
  let app: express.Express;
  let token: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      options: [opt(1, ['paris', 'rome']), opt(2, ['tokyo']), opt(3, ['rome', 'paris'])],
    }) } }] });
    const karmaRepo = new StubKarmaRepository();
    app = express();
    app.use(express.json());
    app.use('/auth', createAuthRouter(new UserController(new StubUserRepository()), new StubHighlightRepository()));
    app.use('/ai', createAiRouter(new AiController(), new KarmaController(karmaRepo), karmaRepo,
      new StubAiPlanRequestRepository(), new StubNotificationRepository()));
    app.use(errorHandler);
    token = (await request(app).post('/auth/register')
      .send({ name: 'T', email: 'cities@test.com', password: 'secret123', otp: '123456' })).body.token;
  });

  it('builds the prompt from the city names and keeps only options inside the chosen cities', async () => {
    const res = await request(app).post('/ai/suggest').set('Authorization', `Bearer ${token}`)
      .send({ cityIds: ['paris', 'rome'], duration: 5, cityIndex: index.slice(0, 2), preferences: 'Tipos de experiencia preferidos: Museos' });
    expect(res.status).toBe(200);
    const userMessage = create.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain('Destinos elegidos');
    expect(userMessage).toContain('Paris, Rome.');
    expect(userMessage).toContain('Tipos de experiencia preferidos: Museos');
    expect(res.body.options.every((o: { cityIds: string[] }) => o.cityIds.every(id => ['paris', 'rome'].includes(id)))).toBe(true);
  });

  it('400 cities_exceed_days when duration < cities', async () => {
    const res = await request(app).post('/ai/suggest').set('Authorization', `Bearer ${token}`)
      .send({ cityIds: ['paris', 'rome'], duration: 1, cityIndex: index });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'cities_exceed_days' });
    expect(create).not.toHaveBeenCalled();
  });
});
