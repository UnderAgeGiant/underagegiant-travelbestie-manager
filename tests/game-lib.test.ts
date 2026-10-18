import {
  RUNNER_RULES, scoreFor, maxObstacles, runRejection, runnerTiersFor,
  gameRunKey, saveRun, takeRun, GAME_RUN_TTL,
} from '../src/lib/game';
import { redis } from '../src/lib/redis';

jest.mock('../src/lib/redis', () => ({ redis: { set: jest.fn(), getdel: jest.fn() } }));

describe('RUNNER_RULES', () => {
  it('matches the frontend copy (runner-rules.ts) — change both together', () => {
    expect(RUNNER_RULES).toEqual({
      START_SPEED: 300, ACCEL: 6, MAX_SPEED: 900,
      MIN_SPAWN_MS: 900, MAX_SPAWN_MS: 2000,
      POINTS_PER_SECOND: 10, POINTS_PER_OBSTACLE: 5,
    });
  });
});

describe('scoreFor', () => {
  it('counts whole seconds and obstacles', () => {
    expect(scoreFor(0, 0)).toBe(0);
    expect(scoreFor(999, 0)).toBe(0);
    expect(scoreFor(61_200, 58)).toBe(610 + 290);
  });
});

describe('maxObstacles', () => {
  it('is one per MIN_SPAWN_MS plus one', () => {
    expect(maxObstacles(0)).toBe(1);
    expect(maxObstacles(899)).toBe(1);
    expect(maxObstacles(900)).toBe(2);
    expect(maxObstacles(60_000)).toBe(67);
  });
});

describe('runRejection', () => {
  const started = 1_000_000;
  it('accepts a consistent run within the clock', () => {
    expect(runRejection({ score: 900, durationMs: 61_200, obstacles: 58 }, started, started + 61_000)).toBeNull();
  });
  it('allows 3 s of grace over the server clock', () => {
    expect(runRejection({ score: 640, durationMs: 64_000, obstacles: 0 }, started, started + 61_000)).toBeNull();
    expect(runRejection({ score: 640, durationMs: 64_001, obstacles: 0 }, started, started + 61_000)).toBe('too_long');
  });
  it('rejects a score that does not follow from duration and obstacles', () => {
    expect(runRejection({ score: 999_999, durationMs: 10_000, obstacles: 0 }, started, started + 10_000)).toBe('score_mismatch');
  });
  it('rejects more obstacles than physically possible', () => {
    expect(runRejection({ score: 100 + 5 * 13, durationMs: 10_000, obstacles: 13 }, started, started + 10_000)).toBe('too_many_obstacles');
  });
});

describe('runnerTiersFor', () => {
  it('returns every tier reached, lowest first', () => {
    expect(runnerTiersFor(499)).toEqual([]);
    expect(runnerTiersFor(500)).toEqual(['bronze']);
    expect(runnerTiersFor(4_999)).toEqual(['bronze', 'silver']);
    expect(runnerTiersFor(5_000)).toEqual(['bronze', 'silver', 'gold']);
  });
});

describe('run store', () => {
  it('saves {userId, startedAt} with the run TTL', async () => {
    await saveRun('r1', 'u1', 42);
    expect(redis.set).toHaveBeenCalledWith(gameRunKey('r1'), JSON.stringify({ userId: 'u1', startedAt: 42 }), 'EX', GAME_RUN_TTL);
  });
  it('takeRun is a GETDEL and returns null when missing', async () => {
    (redis.getdel as jest.Mock).mockResolvedValueOnce(JSON.stringify({ userId: 'u1', startedAt: 42 }));
    expect(await takeRun('r1')).toEqual({ userId: 'u1', startedAt: 42 });
    expect(redis.getdel).toHaveBeenCalledWith('game:run:r1');
    (redis.getdel as jest.Mock).mockResolvedValueOnce(null);
    expect(await takeRun('r1')).toBeNull();
  });
});
