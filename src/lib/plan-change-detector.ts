import { PlanChangeInfo, PlanChangeResult, PlanSessionOptions, TripSuggestion } from '../types';
import { levenshtein } from './levenshtein';

export const CHANGE_THRESHOLD = 0.20;
export const FREE_CHANGE_LIMIT = 3;

/**
 * Produces a canonical, order-insensitive string from a PlanSessionOptions.
 * Lowercase + trim ensures case/whitespace differences don't inflate ratio.
 */
export function serializeOptions(opts: PlanSessionOptions): string {
  return JSON.stringify({
    title:      opts.selectedOptionTitle.trim().toLowerCase(),
    summary:    opts.selectedOptionSummary.trim().toLowerCase(),
    highlights: [...opts.selectedOptionHighlights].sort().map(h => h.trim().toLowerCase()),
    preferences: opts.preferences.trim().toLowerCase(),
    duration:   opts.duration,
    budget:     opts.budget.trim().toLowerCase(),
    startDate:  opts.startDate.trim(),
  });
}

/**
 * Returns the change ratio between two option snapshots.
 * 0 = identical, 1 = completely different.
 * Uses normalized Levenshtein over the serialized representation.
 */
export function computeChangeRatio(
  oldOpts: PlanSessionOptions,
  newOpts: PlanSessionOptions,
): number {
  const a = serializeOptions(oldOpts);
  const b = serializeOptions(newOpts);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return levenshtein(a, b) / maxLen;
}

/** Returns true when the change ratio is within the allowed free-change threshold. */
export function isMinorChange(oldOpts: PlanSessionOptions, newOpts: PlanSessionOptions): boolean {
  return computeChangeRatio(oldOpts, newOpts) <= CHANGE_THRESHOLD;
}

/** Extracts PlanSessionOptions from a raw /ai/plan request body. */
export function toSessionOptions(body: {
  selectedOption: TripSuggestion;
  preferences:    string;
  duration?:      number;
  budget?:        string;
  startDate?:     string;
}): PlanSessionOptions {
  return {
    selectedOptionTitle:      body.selectedOption.title,
    selectedOptionSummary:    body.selectedOption.summary,
    selectedOptionHighlights: body.selectedOption.highlights,
    preferences:              body.preferences,
    duration:                 body.duration ?? 0,
    budget:                   body.budget ?? '',
    startDate:                body.startDate ?? '',
  };
}

/**
 * Builds the changeInfo payload the frontend renders (free-change banner/counter)
 * from a PlanChangeResult. Pure — moved out of append-plan-change-info.middleware.ts
 * (deleted) so the background AI plan job can call it without an Express req/res.
 */
export function buildPlanChangeInfo(result: PlanChangeResult): PlanChangeInfo {
  if (result.type === 'new_session') {
    return { type: 'new_session', freeChangesUsed: 0, freeChangesRemaining: FREE_CHANGE_LIMIT };
  }
  if (result.type === 'free_change') {
    return {
      type:                 'free_change',
      freeChangesUsed:      result.freeChangesUsed + 1,   // count AFTER this change
      freeChangesRemaining: result.freeChangesRemaining,
    };
  }
  return {
    type:                 'charged_change',
    freeChangesUsed:      result.freeChangesUsed,
    freeChangesRemaining: 0,
    reason:               result.reason,
  };
}
