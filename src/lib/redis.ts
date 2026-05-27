import Redis from 'ioredis';
import { createHash } from 'crypto';

// Vercel serverless-safe: lazyConnect avoids a cold-start connection.
// In production, point REDIS_URL to an Upstash TLS endpoint:
//   rediss://:<password>@<host>:6380
// In local dev, point to a local Redis: redis://127.0.0.1:6379
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

export const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,   // fail fast instead of queuing when down
  maxRetriesPerRequest: 1,     // one retry then throw
});

// Silence unhandled error events so a Redis outage doesn't crash the process.
// The middlewares catch errors and fall back to "new_session" behaviour.
redis.on('error', () => { /* swallowed intentionally */ });

/**
 * Redis key for a user's plan change session.
 * Format: plan:{userId}:{sha256(planSessionId)}
 */
export function planSessionKey(userId: string, planSessionId: string): string {
  const hash = createHash('sha256').update(planSessionId).digest('hex');
  return `plan:${userId}:${hash}`;
}
