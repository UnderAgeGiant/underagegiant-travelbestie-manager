import request from 'supertest';
import express from 'express';
import { MemoryUserRepository } from '../src/repositories/memory/memory-user.repository';
import { MemoryKarmaRepository } from '../src/repositories/memory/memory-karma.repository';
import { UserController } from '../src/controllers/user.controller';
import { KarmaController } from '../src/controllers/karma.controller';
import { createAuthRouter } from '../src/routes/auth.routes';
import { createKarmaRouter } from '../src/routes/karma.routes';
import { errorHandler } from '../src/middleware/error.middleware';

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));

function buildApp() {
  const karmaRepo = new MemoryKarmaRepository();
  const app = express();
  app.use(express.json());
  app.use('/auth',  createAuthRouter(new UserController(new MemoryUserRepository())));
  app.use('/karma', createKarmaRouter(new KarmaController(karmaRepo)));
  app.use(errorHandler);
  return { app, karmaRepo };
}

async function getToken(app: express.Express): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'Ana', email: 'ana@test.com', password: 'secret123' });
  return res.body.token as string;
}

describe('GET /karma', () => {
  it('returns 401 without token', async () => {
    expect((await request(buildApp().app).get('/karma')).status).toBe(401);
  });

  it('returns 0 for a new user', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/karma').set('Authorization', `Bearer ${await getToken(app)}`);
    expect(res.status).toBe(200);
    expect(res.body.karma).toBe(0);
  });

  it('reflects mutations applied by other routes', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    await karmaRepo.apply('ana@test.com', +2);
    const res = await request(app).get('/karma').set('Authorization', `Bearer ${token}`);
    expect(res.body.karma).toBe(2);
  });
});
