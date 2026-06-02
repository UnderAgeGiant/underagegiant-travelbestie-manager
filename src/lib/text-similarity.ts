export const COMMENT_SIMILARITY_THRESHOLD = 0.80;

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
