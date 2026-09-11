import { encodeKarmaEventsCursor, decodeKarmaEventsCursor } from '../../src/lib/karma-events-cursor';

describe('karma events cursor', () => {
  it('round-trips through encode then decode', () => {
    const cursor = { createdAt: '2026-09-10T14:22:00.000Z', eventId: 'a1b2c3' };
    const encoded = encodeKarmaEventsCursor(cursor);
    expect(decodeKarmaEventsCursor(encoded)).toEqual(cursor);
  });

  it('returns null for a non-base64 garbage string', () => {
    expect(decodeKarmaEventsCursor('not valid base64 json!!!')).toBeNull();
  });

  it('returns null for valid base64 that decodes to the wrong shape', () => {
    const wrongShape = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString('base64');
    expect(decodeKarmaEventsCursor(wrongShape)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(decodeKarmaEventsCursor('')).toBeNull();
  });
});
