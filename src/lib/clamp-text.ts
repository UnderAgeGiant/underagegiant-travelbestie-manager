/** Cuts `s` to at most `max` chars, ending in '…' when it was longer. AI display text uses this instead of failing on length. */
export function clampText(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}
