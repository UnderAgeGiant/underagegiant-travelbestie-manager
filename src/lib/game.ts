import { redis } from './redis';

/** Feature 73 — Miel Runner. Mirrored EXACTLY by the frontend's core/game/runner-rules.ts; change both together. */
export const RUNNER_RULES = {
  START_SPEED: 300,         // world px/s at t=0 (600-px-wide world) — frontend only, pinned for parity
  ACCEL: 6,                 // px/s² — frontend only
  MAX_SPEED: 900,           // px/s — frontend only
  MIN_SPAWN_MS: 900,        // obstacles never spawn closer than this in time → validator cap
  MAX_SPAWN_MS: 2000,       // frontend only
  POINTS_PER_SECOND: 10,
  POINTS_PER_OBSTACLE: 5,
} as const;

export const GAME_RUN_TTL = 1800;          // s — a run left open longer is dead
export const GAME_CLOCK_GRACE_MS = 3000;   // start-request + finish latency
export const PERSISTENT_MIN_MS = 10_000;   // runs that count toward "Persistente"
export const RUNNER_TIER_SCORES = { bronze: 500, silver: 2000, gold: 5000 } as const;

export interface FinishRunBody { score: number; durationMs: number; obstacles: number }
export interface GameRun { userId: string; startedAt: number }
export type RunRejection = 'too_long' | 'score_mismatch' | 'too_many_obstacles';

export const scoreFor = (durationMs: number, obstacles: number): number =>
  RUNNER_RULES.POINTS_PER_SECOND * Math.floor(durationMs / 1000) + RUNNER_RULES.POINTS_PER_OBSTACLE * obstacles;

export const maxObstacles = (durationMs: number): number => Math.floor(durationMs / RUNNER_RULES.MIN_SPAWN_MS) + 1;

/** null = plausible. The server clock (startedAt → now) is the authority on duration. */
export function runRejection(b: FinishRunBody, startedAt: number, now: number): RunRejection | null {
  if (b.durationMs > now - startedAt + GAME_CLOCK_GRACE_MS) return 'too_long';
  if (b.score !== scoreFor(b.durationMs, b.obstacles)) return 'score_mismatch';
  if (b.obstacles > maxObstacles(b.durationMs)) return 'too_many_obstacles';
  return null;
}

/** Lowest first — TrophyRecorder counts one event per tier, so the order makes count == tiers reached. */
export function runnerTiersFor(score: number): ('bronze' | 'silver' | 'gold')[] {
  return (['bronze', 'silver', 'gold'] as const).filter(t => score >= RUNNER_TIER_SCORES[t]);
}

export const gameRunKey = (runId: string): string => `game:run:${runId}`;

export async function saveRun(runId: string, userId: string, now: number = Date.now()): Promise<void> {
  await redis.set(gameRunKey(runId), JSON.stringify({ userId, startedAt: now }), 'EX', GAME_RUN_TTL);
}

/** Atomic read+delete → every run is single-use. Throws when Redis is down (callers answer 503). */
export async function takeRun(runId: string): Promise<GameRun | null> {
  const raw = await redis.getdel(gameRunKey(runId));
  return raw ? (JSON.parse(raw) as GameRun) : null;
}
