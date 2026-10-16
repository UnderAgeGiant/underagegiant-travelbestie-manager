jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }));

import { waitUntil } from '@vercel/functions';
import { capture, alias } from '../src/lib/analytics';
import { logger } from '../src/lib/logger';

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const pending = () => {
  const calls = (waitUntil as jest.Mock).mock.calls;
  return calls[calls.length - 1][0] as Promise<unknown>;
};
const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body);

beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  process.env.POSTHOG_API_KEY = 'phc_test';
  delete process.env.POSTHOG_HOST;
  delete process.env.VERCEL_ENV;
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { global.fetch = originalFetch; delete process.env.POSTHOG_API_KEY; });

describe('capture', () => {
  it('does nothing without POSTHOG_API_KEY', () => {
    delete process.env.POSTHOG_API_KEY;
    capture('u-1', 'cta_test');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('does nothing without a distinct id', () => {
    capture(null, 'cta_test');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs one event to the US /batch/ endpoint via waitUntil', async () => {
    capture('u-1', 'cta_trip_share', { tripId: 't-1' });
    await pending();
    expect(fetchMock.mock.calls[0][0]).toBe('https://us.i.posthog.com/batch/');
    const body = sent();
    expect(body.api_key).toBe('phc_test');
    expect(body.batch).toHaveLength(1);
    expect(body.batch[0]).toMatchObject({
      event: 'cta_trip_share', distinct_id: 'u-1',
      properties: { tripId: 't-1', environment: 'local' },
    });
    expect(typeof body.batch[0].timestamp).toBe('string');
  });

  it('honours POSTHOG_HOST and VERCEL_ENV', async () => {
    process.env.POSTHOG_HOST = 'https://eu.i.posthog.com';
    process.env.VERCEL_ENV = 'production';
    capture('u-1', 'cta_test');
    await pending();
    expect(fetchMock.mock.calls[0][0]).toBe('https://eu.i.posthog.com/batch/');
    expect(sent().batch[0].properties.environment).toBe('production');
  });

  it('strips email-like properties', async () => {
    capture('u-1', 'cta_collaborator_invite', { tripId: 't-1', email: 'a@b.c', invitedEmail: 'x@y.z' });
    await pending();
    const props = sent().batch[0].properties;
    expect(props.tripId).toBe('t-1');
    expect(props).not.toHaveProperty('email');
    expect(props).not.toHaveProperty('invitedEmail');
  });

  it('logs a WARN on a non-2xx response and does not throw', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    capture('u-1', 'cta_test');
    await expect(pending()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'analytics_failed', status: 401 }));
  });

  it('logs a WARN when fetch rejects and does not throw', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(() => capture('u-1', 'cta_test')).not.toThrow();
    await expect(pending()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'analytics_failed' }));
  });
});

describe('alias', () => {
  it('sends $create_alias linking the anonymous id to the user id', async () => {
    alias('anon-1', 'u-1');
    await pending();
    expect(sent().batch[0]).toMatchObject({
      event: '$create_alias', distinct_id: 'u-1', properties: { alias: 'anon-1' },
    });
  });

  it('skips when either id is missing or they are equal', () => {
    alias(null, 'u-1');
    alias('anon-1', null);
    alias('u-1', 'u-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
