import request from 'supertest';
import express from 'express';
import { StubRankingRepository } from './helpers/stubs';
import { RankingController } from '../src/controllers/ranking.controller';
import { createRankingsRouter } from '../src/routes/rankings.routes';
import { errorHandler } from '../src/middleware/error.middleware';
import { signToken } from '../src/lib/jwt';
import { santiagoWeekStart } from '../src/lib/rankings';

jest.mock('../src/lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1), expire: jest.fn().mockResolvedValue(1),
  },
}));

const TOKEN = signToken({ userId: 'u1', email: 'a@b.com', name: 'Ana' });

function buildApp() {
  const repo = new StubRankingRepository();
  const app = express();
  app.use('/rankings', createRankingsRouter(new RankingController(repo)));
  app.use(errorHandler);
  return { app, repo };
}

describe('GET /rankings', () => {
  it('401s without a token', async () => {
    expect((await request(buildApp().app).get('/rankings')).status).toBe(401);
  });

  it('returns the 4 rankings for the current Santiago week', async () => {
    const { app, repo } = buildApp();
    const res = await request(app).get('/rankings').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.weekStart).toBe(santiagoWeekStart());
    expect(Object.keys(res.body).sort()).toEqual(
      ['generatedAt', 'topDestinations', 'topFavorited', 'topPlanners', 'topTrophies', 'weekStart']);
    expect(repo.weeklyCalls).toEqual([santiagoWeekStart()]);
  });

  it('never exposes emails or user ids', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/rankings').set('Authorization', `Bearer ${TOKEN}`);
    expect(JSON.stringify(res.body)).not.toMatch(/email|userId|ownerId|"u1"/);
  });
});

describe('GET /rankings/me', () => {
  it('401s without a token', async () => {
    expect((await request(buildApp().app).get('/rankings/me')).status).toBe(401);
  });

  it("returns the caller's positions, keyed by the JWT user", async () => {
    const { app, repo } = buildApp();
    const res = await request(app).get('/rankings/me').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ weekStart: santiagoWeekStart(), planners: { rank: 2, value: 3 }, trophies: null, favorited: null });
    expect(repo.mineCalls).toEqual([{ weekStart: santiagoWeekStart(), userId: 'u1' }]);
  });
});
