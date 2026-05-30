import request from 'supertest';
import express from 'express';
import { StubUserRepository, StubCommentRepository } from './helpers/stubs';
import { CommentController } from '../src/controllers/comment.controller';
import { UserController } from '../src/controllers/user.controller';
import { createCommentsRouter } from '../src/routes/comments.routes';
import { createAuthRouter } from '../src/routes/auth.routes';
import { errorHandler } from '../src/middleware/error.middleware';

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/auth/verify-otp.middleware', () => ({
  verifyOtpMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/rate-limit.middleware', () => ({
  rateLimitMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth',     createAuthRouter(new UserController(new StubUserRepository())));
  app.use('/comments', createCommentsRouter(new CommentController(new StubCommentRepository())));
  app.use(errorHandler);
  return app;
}

async function getToken(app: express.Express, email = 'ana@test.com'): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'Ana', email, password: 'secret123', otp: '123456' });
  return res.body.token as string;
}

describe('GET /comments/:attractionId', () => {
  it('returns empty array when no comments (public)', async () => {
    const res = await request(buildApp()).get('/comments/paris_0');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /comments/:attractionId', () => {
  it('returns 401 without token', async () => {
    const res = await request(buildApp()).post('/comments/paris_0')
      .send({ text: 'Breathtaking!', rating: 5, color: '#F472B6', date: 'Apr 24' });
    expect(res.status).toBe(401);
  });

  it('creates a comment and uses name from JWT (not body)', async () => {
    const app = buildApp();
    const token = await getToken(app);
    const res = await request(app).post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'SPOOFED NAME', text: 'Breathtaking!', rating: 5, color: '#F472B6', date: 'Apr 24' });
    expect(res.status).toBe(201);
    expect(res.body.attractionId).toBe('paris_0');
    expect(res.body.name).toBe('Ana');
  });

  it('returns 400 when rating is out of range', async () => {
    const app = buildApp();
    const token = await getToken(app);
    expect((await request(app).post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'ok', rating: 6, color: '#fff', date: 'Apr 24' })).status).toBe(400);
  });

  it('persists comment so GET returns it', async () => {
    const app = buildApp();
    const token = await getToken(app);
    await request(app).post('/comments/rome_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Lovely!', rating: 4, color: '#34D399', date: 'Apr 24' });
    expect((await request(app).get('/comments/rome_0')).body[0].name).toBe('Ana');
  });
});
