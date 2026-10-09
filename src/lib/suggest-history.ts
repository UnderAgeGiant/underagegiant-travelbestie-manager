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

/**
 * Identity of a suggestion: ordered city ids + normalized title. Cities alone are not enough —
 * a single-city request ("Coquimbo") yields many distinct options with the same cityIds.
 */
export function routeKey(o: ShownSuggestion): string {
  return `${(o.cityIds ?? []).join('>')}|${o.title.trim().toLowerCase()}`;
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * When the traveler names cities from the index ("Coquimbo"), keep only options that stay inside
 * those cities. Names match accent/case-insensitively as whole words. Nothing named, no index,
 * or no surviving option → the list is returned unchanged (never empty).
 * ponytail: plain name matching — a city named like a common word ("Nice" in "a nice trip") can
 * over-restrict; upgrade to an explicit destination field from the frontend if that bites.
 */
export function restrictToMentionedCities(
  options: TripSuggestion[], preferences: string, cityIndex?: { id: string; name: string }[],
): TripSuggestion[] {
  const text = fold(preferences);
  const named = new Set(
    (cityIndex ?? [])
      .filter(c => new RegExp(`(^|[^a-z0-9])${escapeRegExp(fold(c.name))}($|[^a-z0-9])`).test(text))
      .map(c => c.id),
  );
  if (named.size === 0) return options;
  const kept = options.filter(o => (o.cityIds?.length ?? 0) > 0 && o.cityIds!.every(id => named.has(id)));
  if (kept.length === 0) {
    logger.warn({ msg: 'AI suggest: no option stayed inside the named cities; returning unfiltered', named: [...named] });
    return options;
  }
  return kept;
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
