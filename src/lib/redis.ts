import Redis from 'ioredis';
import { createHash } from 'crypto';

// In production, point REDIS_URL to an Upstash TLS endpoint:
//   rediss://:<password>@<host>:6380
// In local dev, point to a local Redis: redis://127.0.0.1:6379
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

export const redis = new Redis(REDIS_URL, {
  connectTimeout: 5000,        // give Vercel cold starts time to connect
  commandTimeout: 3000,        // bound individual command wait
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

export function commentCooldownKey(userId: string): string {
  return `comment:cooldown:${userId}`;
}

export function commentLastTextKey(userId: string): string {
  return `comment:last:${userId}`;
}

export function commentCacheKey(attractionId: string): string {
  return `comments:att:${attractionId}`;
}

export const COMMENT_CACHE_TTL = 60;

export function notificationStatusKey(userId: string): string {
  return `notif:status:${userId}`;
}

// Correctness comes from invalidate-on-write (add/markAllRead/setMuted), not this TTL —
// it's only a safety net for a missed invalidation. Set well above the 60 s poll interval
// so normal continuous polling never expires mid-session; 90 s would miss on every other poll.
export const NOTIFICATION_STATUS_CACHE_TTL = 600;
