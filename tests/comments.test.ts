import request from 'supertest';
import express from 'express';
import { MemoryCommentRepository } from '../src/repositories/memory/memory-comment.repository';
import { MemoryKarmaRepository } from '../src/repositories/memory/memory-karma.repository';
import { MemoryUserRepository } from '../src/repositories/memory/memory-user.repository';
import { CommentController } from '../src/controllers/comment.controller';
import { UserController } from '../src/controllers/user.controller';
import { createCommentsRouter } from '../src/routes/comments.routes';
import { createAuthRouter } from '../src/routes/auth.routes';
import { errorHandler } from '../src/middleware/error.middleware';

jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));

function buildApp() {
  const commentRepo = new MemoryCommentRepository();
  const karmaRepo = new MemoryKarmaRepository();
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(new UserController(new MemoryUserRepository())));
  app.use('/comments', createCommentsRouter(new CommentController(commentRepo), karmaRepo, commentRepo));
  app.use(errorHandler);
  return { app, karmaRepo };
}

async function getToken(app: express.Express, email = 'ana@test.com'): Promise<string> {
  const res = await request(app).post('/auth/register').send({ name: 'Ana', email, password: 'secret123' });
  return res.body.token as string;
}

describe('GET /comments/:attractionId', () => {
  it('returns empty array when no comments (public)', async () => {
    const res = await request(buildApp().app).get('/comments/paris_0');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /comments/:attractionId', () => {
  it('returns 401 without token', async () => {
    const res = await request(buildApp().app).post('/comments/paris_0')
      .send({ text: 'Breathtaking!', rating: 5, color: '#F472B6', date: 'Apr 24' });
    expect(res.status).toBe(401);
  });

  it('creates a comment and uses name from JWT (not body)', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    const res = await request(app).post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'SPOOFED NAME', text: 'Breathtaking!', rating: 5, color: '#F472B6', date: 'Apr 24' });
    expect(res.status).toBe(201);
    expect(res.body.attractionId).toBe('paris_0');
    expect(res.body.name).toBe('Ana');
  });

  it('awards +1 karma on first comment', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    await request(app).post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Breathtaking!', rating: 5, color: '#F472B6', date: 'Apr 24' });
    expect((await karmaRepo.get('ana@test.com')).score).toBe(1);
  });

  it('does not award karma on second comment on same attraction', async () => {
    const { app, karmaRepo } = buildApp();
    const token = await getToken(app);
    const payload = { text: 'Breathtaking!', rating: 5, color: '#F472B6', date: 'Apr 24' };
    await request(app).post('/comments/paris_0').set('Authorization', `Bearer ${token}`).send(payload);
    await request(app).post('/comments/paris_0').set('Authorization', `Bearer ${token}`).send(payload);
    expect((await karmaRepo.get('ana@test.com')).score).toBe(1);
  });

  it('returns 400 when rating is out of range', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    expect((await request(app).post('/comments/paris_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'ok', rating: 6, color: '#fff', date: 'Apr 24' })).status).toBe(400);
  });

  it('persists comment so GET returns it', async () => {
    const { app } = buildApp();
    const token = await getToken(app);
    await request(app).post('/comments/rome_0')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Lovely!', rating: 4, color: '#34D399', date: 'Apr 24' });
    expect((await request(app).get('/comments/rome_0')).body[0].name).toBe('Ana');
  });
});
