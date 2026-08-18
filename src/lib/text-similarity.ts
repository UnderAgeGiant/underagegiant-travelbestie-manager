import { levenshtein } from './levenshtein';

export const COMMENT_SIMILARITY_THRESHOLD = 0.80;

/**
 * Returns the change ratio between two comment texts.
 * 0 = identical, 1 = completely different.
 * Normalises to lowercase + trim before comparison.
 */
export function computeTextChangeRatio(a: string, b: string): number {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  return levenshtein(na, nb) / maxLen;
}
