import { generateRefreshToken, hashToken } from '../../src/lib/tokens';

describe('generateRefreshToken', () => {
  it('returns a 64-char hex string', () => {
    const token = generateRefreshToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns a different value on each call', () => {
    expect(generateRefreshToken()).not.toBe(generateRefreshToken());
  });
});

describe('hashToken', () => {
  it('returns a 64-char hex string', () => {
    expect(hashToken('some-raw-token')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input, same output', () => {
    const raw = 'abc123';
    expect(hashToken(raw)).toBe(hashToken(raw));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});
