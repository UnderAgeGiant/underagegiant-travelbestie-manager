import { Request } from 'express';
import { resolveUserKey } from '../../src/lib/request-identity';

function mockReq(overrides: { user?: { userId: string }; anonymousId?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (overrides.anonymousId) headers['x-anonymous-id'] = overrides.anonymousId;
  return {
    user: overrides.user,
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

describe('resolveUserKey', () => {
  it('returns the authenticated userId when req.user is set', () => {
    expect(resolveUserKey(mockReq({ user: { userId: 'u-1' }, anonymousId: 'a-uuid-should-be-ignored' }))).toBe('u-1');
  });

  it('falls back to a valid X-Anonymous-Id header when no user is authenticated', () => {
    const id = '12345678-1234-1234-1234-123456789012';
    expect(resolveUserKey(mockReq({ anonymousId: id }))).toBe(id);
  });

  it('returns null when neither is present', () => {
    expect(resolveUserKey(mockReq())).toBeNull();
  });

  it('returns null for a malformed X-Anonymous-Id header (same validation as highlightIdentity)', () => {
    expect(resolveUserKey(mockReq({ anonymousId: 'not-a-uuid' }))).toBeNull();
  });

  it('does not throw when req.header is not a function (hand-rolled test mocks elsewhere in this repo)', () => {
    const req = { user: undefined } as unknown as Request;
    expect(resolveUserKey(req)).toBeNull();
  });
});
