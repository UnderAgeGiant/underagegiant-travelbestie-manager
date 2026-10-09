import { createHash } from 'crypto';
import { redis } from './redis';
import { logger } from './logger';
import { SUGGESTED_OPTIONS_TTL_SECONDS } from './suggested-options-store';
import type { TripSuggestion } from '../types';

/** Every option shown in one AI-planning session (T1, designer feedback 2026-10-08) — fed back into the suggest prompt so "Generar nuevas opciones" never repeats. */
export type ShownSuggestion = Pick<TripSuggestion, 'title' | 'cityIds'>;

export const SUGGEST_HISTORY_MAX = 30;

export function suggestHistoryKey(userId: string, planSessionId: string): string {
  const hash = createHash('sha256').update(planSessionId).digest('hex');
  return `suggest:history:${userId}:${hash}`;
}

/** Identity of a suggestion's route: ordered city ids, else its normalized title. */
export function routeKey(o: ShownSuggestion): string {
  return o.cityIds?.length ? o.cityIds.join('>') : o.title.trim().toLowerCase();
}

export async function loadSuggestHistory(userId: string, planSessionId: string): Promise<ShownSuggestion[]> {
  try {
    const raw = await redis.get(suggestHistoryKey(userId, planSessionId));
    return raw ? (JSON.parse(raw) as ShownSuggestion[]) : [];
  } catch (err) {
    logger.warn({ msg: 'Failed to load suggest history', userId, err });
    return [];
  }
}

export async function appendSuggestHistory(userId: string, planSessionId: string, options: TripSuggestion[]): Promise<void> {
  try {
    const prev = await loadSuggestHistory(userId, planSessionId);
    const next = [...prev, ...options.map(o => ({ title: o.title, cityIds: o.cityIds ?? [] }))].slice(-SUGGEST_HISTORY_MAX);
    await redis.set(suggestHistoryKey(userId, planSessionId), JSON.stringify(next), 'EX', SUGGESTED_OPTIONS_TTL_SECONDS);
  } catch (err) {
    logger.warn({ msg: 'Failed to append suggest history', userId, err });
  }
}

/** Safety net behind the prompt: drops exact route repeats; never returns an empty list. */
export function dropRepeatedSuggestions(options: TripSuggestion[], history: ShownSuggestion[]): TripSuggestion[] {
  const seen = new Set(history.map(routeKey));
  const kept = options.filter(o => !seen.has(routeKey(o)));
  if (kept.length === 0) {
    logger.warn({ msg: 'AI suggest repeated every option; returning unfiltered', count: options.length });
    return options;
  }
  return kept;
}
