import { encodeKarmaEventsCursor, decodeKarmaEventsCursor } from '../../src/lib/karma-events-cursor';

describe('karma events cursor', () => {
  it('round-trips through encode then decode', () => {
    const cursor = { createdAt: '2026-09-10T14:22:00.000Z', eventId: 'a1b2c3d4-e5f6-4789-8abc-def012345678' };
    const encoded = encodeKarmaEventsCursor(cursor);
    expect(decodeKarmaEventsCursor(encoded)).toEqual(cursor);
  });

  it('encodes using base64url (no +, /, or = hazards for query strings)', () => {
    const cursor = { createdAt: '2026-09-10T14:22:00.000Z', eventId: 'a1b2c3d4-e5f6-4789-8abc-def012345678' };
    const encoded = encodeKarmaEventsCursor(cursor);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('returns null for a non-base64 garbage string', () => {
    expect(decodeKarmaEventsCursor('not valid base64 json!!!')).toBeNull();
  });

  it('returns null for valid base64 that decodes to the wrong shape', () => {
    const wrongShape = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString('base64url');
    expect(decodeKarmaEventsCursor(wrongShape)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(decodeKarmaEventsCursor('')).toBeNull();
  });

  it('returns null when createdAt is not a parseable date', () => {
    const bad = Buffer.from(JSON.stringify({ createdAt: 'not-a-date', eventId: 'a1b2c3d4-e5f6-4789-8abc-def012345678' }), 'utf8').toString('base64url');
    expect(decodeKarmaEventsCursor(bad)).toBeNull();
  });

  it('returns null when eventId is not UUID-shaped', () => {
    const bad = Buffer.from(JSON.stringify({ createdAt: '2026-09-10T14:22:00.000Z', eventId: 'not-a-uuid' }), 'utf8').toString('base64url');
    expect(decodeKarmaEventsCursor(bad)).toBeNull();
  });
});
