import request from 'supertest';
import express from 'express';
import { StubGameRepository, StubTrophyRepository, StubNotificationRepository } from './helpers/stubs';
import { GameController } from '../src/controllers/game.controller';
import { createGameRouter } from '../src/routes/game.routes';
import { TrophyRecorder } from '../src/lib/trophy-recorder';
import { errorHandler } from '../src/middleware/error.middleware';
import { signToken } from '../src/lib/jwt';
import { santiagoWeekStart, rankingsKey, myRankingsKey } from '../src/lib/rankings';
import { redis } from '../src/lib/redis';

const store = new Map<string, string>();
jest.mock('../src/lib/redis', () => ({
  redis: {
    set: jest.fn(async (k: string, v: string) => { store.set(k, v); return 'OK'; }),
    getdel: jest.fn(async (k: string) => { const v = store.get(k) ?? null; store.delete(k); return v; }),
    del: jest.fn(async () => 1),
    get: jest.fn().mockResolvedValue(null),
    incr: jest.fn().mockResolvedValue(1), expire: jest.fn().mockResolvedValue(1),
  },
}));

const ANA = signToken({ userId: '11111111-1111-4111-8111-111111111111', email: 'a@b.com', name: 'Ana' });
const LUIS = signToken({ userId: '22222222-2222-4222-8222-222222222222', email: 'l@b.com', name: 'Luis' });

function buildApp() {
  const repo = new StubGameRepository();
  const trophies = new StubTrophyRepository();
  const recorder = new TrophyRecorder(trophies, new StubNotificationRepository());
  const app = express();
  app.use(express.json());
  app.use('/game', createGameRouter(new GameController(repo), recorder));
  app.use(errorHandler);
  return { app, repo, trophies };
}

async function start(app: express.Express, token = ANA): Promise<string> {
  const res = await request(app).post('/game/runs').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(201);
  return res.body.runId;
}

/** Pretend the run started `ms` ago. */
function backdate(runId: string, ms: number) {
  const key = `game:run:${runId}`;
  const run = JSON.parse(store.get(key)!);
  store.set(key, JSON.stringify({ ...run, startedAt: run.startedAt - ms }));
}

const finish = (app: express.Express, runId: string, body: object, token = ANA) =>
  request(app).post(`/game/runs/${runId}/finish`).set('Authorization', `Bearer ${token}`).send(body);

beforeEach(() => { store.clear(); jest.clearAllMocks(); });

describe('POST /game/runs', () => {
  it('401s without a token', async () => {
    expect((await request(buildApp().app).post('/game/runs')).status).toBe(401);
  });
  it('stores the run for 1800 s and returns a uuid', async () => {
    const runId = await start(buildApp().app);
    expect(runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(redis.set).toHaveBeenCalledWith(`game:run:${runId}`, expect.any(String), 'EX', 1800);
  });
  it('503s when Redis is down', async () => {
    (redis.set as jest.Mock).mockRejectedValueOnce(new Error('down'));
    const res = await request(buildApp().app).post('/game/runs').set('Authorization', `Bearer ${ANA}`);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'game_unavailable' });
  });
});

describe('POST /game/runs/:runId/finish', () => {
  it('saves a valid run and reports a new weekly record', async () => {
    const { app, repo } = buildApp();
    const runId = await start(app);
    backdate(runId, 61_000);
    const res = await finish(app, runId, { score: 900, durationMs: 61_200, obstacles: 58 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ score: 900, weeklyBest: 900, newRecord: true, weekStart: santiagoWeekStart() });
    expect(repo.calls[0]).toEqual({ userId: '11111111-1111-4111-8111-111111111111', weekStart: santiagoWeekStart(), score: 900 });
  });

  it('busts both rankings keys only on a new record', async () => {
    const { app } = buildApp();
    let runId = await start(app); backdate(runId, 61_000);
    await finish(app, runId, { score: 900, durationMs: 61_200, obstacles: 58 });
    expect(redis.del).toHaveBeenCalledWith(rankingsKey(santiagoWeekStart()), myRankingsKey(santiagoWeekStart(), '11111111-1111-4111-8111-111111111111'));
    (redis.del as jest.Mock).mockClear();
    runId = await start(app); backdate(runId, 10_000);
    await finish(app, runId, { score: 100, durationMs: 10_000, obstacles: 0 });
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('a replayed runId is 404 and counts once', async () => {
    const { app, repo } = buildApp();
    const runId = await start(app); backdate(runId, 10_000);
    expect((await finish(app, runId, { score: 100, durationMs: 10_000, obstacles: 0 })).status).toBe(200);
    expect((await finish(app, runId, { score: 100, durationMs: 10_000, obstacles: 0 })).status).toBe(404);
    expect(repo.calls).toHaveLength(1);
  });

  it("another user's run is 404 and is consumed", async () => {
    const { app } = buildApp();
    const runId = await start(app, ANA); backdate(runId, 10_000);
    const res = await finish(app, runId, { score: 100, durationMs: 10_000, obstacles: 0 }, LUIS);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'run_not_found' });
    expect((await finish(app, runId, { score: 100, durationMs: 10_000, obstacles: 0 })).status).toBe(404);
  });

  it('a malformed runId is 404 without touching Redis', async () => {
    const res = await finish(buildApp().app, 'not-a-uuid', { score: 0, durationMs: 0, obstacles: 0 });
    expect(res.status).toBe(404);
    expect(redis.getdel).not.toHaveBeenCalled();
  });

  it.each([
    [{ score: 640, durationMs: 64_000, obstacles: 0 }, 'too_long'],         // started 60 s ago
    [{ score: 999_999, durationMs: 10_000, obstacles: 0 }, 'score_mismatch'],
    [{ score: 165, durationMs: 10_000, obstacles: 13 }, 'too_many_obstacles'],
  ])('422 %j → %s', async (body, reason) => {
    const { app, repo } = buildApp();
    const runId = await start(app); backdate(runId, 60_000);
    const res = await finish(app, runId, body);
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'invalid_run', reason });
    expect(repo.calls).toHaveLength(0);
  });

  it('400s on a non-integer or negative body', async () => {
    const { app } = buildApp();
    const runId = await start(app);
    expect((await finish(app, runId, { score: -1, durationMs: 0, obstacles: 0 })).status).toBe(400);
    expect((await finish(app, runId, { score: 1.5, durationMs: 0, obstacles: 0 })).status).toBe(400);
  });

  it('503s when Redis is down at claim time', async () => {
    const { app } = buildApp();
    const runId = await start(app);
    (redis.getdel as jest.Mock).mockRejectedValueOnce(new Error('down'));
    expect((await finish(app, runId, { score: 0, durationMs: 0, obstacles: 0 })).status).toBe(503);
  });

  it('awards every runner tier reached and exposes them in X-New-Trophies', async () => {
    const { app, trophies } = buildApp();
    const runId = await start(app); backdate(runId, 300_000);
    const res = await finish(app, runId, { score: 2990 + 5 * 300, durationMs: 299_000, obstacles: 300 }); // 4490 → bronze + silver
    expect(res.status).toBe(200);
    const header = JSON.parse(res.headers['x-new-trophies']);
    expect(header.map((t: { type: string; tier: string }) => `${t.type}:${t.tier}`)).toEqual(['runner:bronze', 'runner:silver']);
    expect(trophies.events.filter(e => e.type === 'runner').map(e => e.refId)).toEqual(['bronze', 'silver']);
  });

  it('counts Persistente only for runs of at least 10 s', async () => {
    const { app, trophies } = buildApp();
    let runId = await start(app); backdate(runId, 9_999);
    await finish(app, runId, { score: 90, durationMs: 9_999, obstacles: 0 });
    runId = await start(app); backdate(runId, 10_000);
    await finish(app, runId, { score: 100, durationMs: 10_000, obstacles: 0 });
    expect(trophies.events.filter(e => e.type === 'runner_persistent')).toHaveLength(1);
  });
});
