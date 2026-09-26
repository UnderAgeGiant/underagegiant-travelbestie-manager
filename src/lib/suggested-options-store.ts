import { createHash } from 'crypto';
import { redis } from './redis';
import { logger } from './logger';
import type { TripSuggestion } from '../types';

export const SUGGESTED_OPTIONS_TTL_SECONDS = 86400; // 24 h — the user may take a while to pick an option

export function suggestedOptionsKey(userId: string, planSessionId: string): string {
  const hash = createHash('sha256').update(planSessionId).digest('hex');
  return `suggest:${userId}:${hash}`;
}

/** Non-fatal: a Redis failure is logged and swallowed (resolveSelectedOption then falls back to the client copy). */
export async function storeSuggestedOptions(userId: string, planSessionId: string, options: TripSuggestion[]): Promise<void> {
  try {
    await redis.set(suggestedOptionsKey(userId, planSessionId), JSON.stringify(options), 'EX', SUGGESTED_OPTIONS_TTL_SECONDS);
  } catch (err) {
    logger.warn({ msg: 'Failed to store suggested options in Redis', userId, err });
  }
}

/** Returns null when nothing is stored. Throws on Redis errors — the caller decides the fallback. */
export async function loadSuggestedOptions(userId: string, planSessionId: string): Promise<TripSuggestion[] | null> {
  const raw = await redis.get(suggestedOptionsKey(userId, planSessionId));
  return raw ? (JSON.parse(raw) as TripSuggestion[]) : null;
}
