import { PlanSessionOptions, TripSuggestion } from '../types';

export const CHANGE_THRESHOLD = 0.20;
export const FREE_CHANGE_LIMIT = 3;

/** Normalized Levenshtein distance (O(m*n) time, O(n) space). */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

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
