import { createHash } from 'crypto';
import { redis } from './redis';
import { logger } from './logger';
import { SUGGESTED_OPTIONS_TTL_SECONDS } from './suggested-options-store';
import type { TripSuggestion } from '../types';
import type { AiSuggestBody } from '../schemas/ai.schemas';

/** Every option shown in one AI-planning session (T1, designer feedback 2026-10-08) — used to filter repeats so "Generar nuevas opciones" never shows one twice. */
export type ShownSuggestion = Pick<TripSuggestion, 'title' | 'cityIds'>;

export const SUGGEST_HISTORY_MAX = 30;


/** Options from the last DeepSeek call not yet shown, valid only while the request inputs are unchanged. */
export interface SuggestQueue {
  inputsHash: string;
  options: TripSuggestion[];
}

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export function suggestHistoryKey(userId: string, planSessionId: string): string {
  return `suggest:history:${userId}:${sha256(planSessionId)}`;
}

export function suggestQueueKey(userId: string, planSessionId: string): string {
  return `suggest:queue:${userId}:${sha256(planSessionId)}`;
}

/** Identity of the inputs that produced a batch; any change invalidates the queue. */
export function suggestInputsHash(body: Pick<AiSuggestBody, 'preferences' | 'duration' | 'budget' | 'cityIndex'>): string {
  return sha256(JSON.stringify([body.preferences, body.duration ?? null, body.budget ?? null, (body.cityIndex ?? []).map(c => c.id)]));
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

export async function loadSuggestQueue(userId: string, planSessionId: string): Promise<SuggestQueue | null> {
  try {
    const raw = await redis.get(suggestQueueKey(userId, planSessionId));
    return raw ? (JSON.parse(raw) as SuggestQueue) : null;
  } catch (err) {
    logger.warn({ msg: 'Failed to load suggest queue', userId, err });
    return null;
  }
}

export async function saveSuggestQueue(userId: string, planSessionId: string, queue: SuggestQueue): Promise<void> {
  try {
    await redis.set(suggestQueueKey(userId, planSessionId), JSON.stringify(queue), 'EX', SUGGESTED_OPTIONS_TTL_SECONDS);
  } catch (err) {
    logger.warn({ msg: 'Failed to save suggest queue', userId, err });
  }
}

/**
 * Splits options into the page to show now (first `size` not already shown, ids renumbered 1..n
 * so the client always sees unique ids) and the unseen rest. If every option was already shown,
 * the page is the first `size` options unfiltered — never an empty response.
 */
export function takeSuggestionPage(
  options: TripSuggestion[], history: ShownSuggestion[], size: number,
): { page: TripSuggestion[]; rest: TripSuggestion[] } {
  const seen = new Set(history.map(routeKey));
  const unseen = options.filter(o => !seen.has(routeKey(o)));
  if (unseen.length === 0) {
    logger.warn({ msg: 'AI suggest repeated every option; returning unfiltered', count: options.length });
  }
  const source = unseen.length > 0 ? unseen : options;
  return {
    page: source.slice(0, size).map((o, i) => ({ ...o, id: i + 1 })),
    rest: unseen.slice(size),
  };
}
