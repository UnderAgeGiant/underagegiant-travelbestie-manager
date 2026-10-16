jest.mock('../src/lib/analytics', () => ({ capture: jest.fn(), alias: jest.fn() }));

import { Request, Response } from 'express';
import { capture, alias } from '../src/lib/analytics';
import { logEvent } from '../src/lib/log-event';
import { aliasAnonymousUser } from '../src/middleware/auth/alias-anonymous-user.middleware';

const ANON = '12345678-1234-1234-1234-123456789012';

function req(overrides: Record<string, unknown> = {}, headers: Record<string, string> = {}): Request {
  return {
    flowId: 'f', headers,
    header: (n: string) => headers[n.toLowerCase()],
    ...overrides,
  } as unknown as Request;
}

beforeEach(() => jest.spyOn(process.stdout, 'write').mockImplementation(() => true));
afterEach(() => jest.restoreAllMocks());

describe('logEvent → capture identity', () => {
  it('uses req.user.userId when authenticated', () => {
    logEvent(req({ user: { userId: 'u-1' } }), 'cta_test', { foo: 1 });
    expect(capture).toHaveBeenCalledWith('u-1', 'cta_test', { foo: 1 });
  });

  it('falls back to req.foundUser.id (login/register/refresh)', () => {
    logEvent(req({ foundUser: { id: 'u-9' } }, { 'x-anonymous-id': ANON }), 'cta_login');
    expect(capture).toHaveBeenCalledWith('u-9', 'cta_login', {});
  });

  it('falls back to the anonymous id', () => {
    logEvent(req({}, { 'x-anonymous-id': ANON }), 'cta_highlight_seen');
    expect(capture).toHaveBeenCalledWith(ANON, 'cta_highlight_seen', {});
  });
});

describe('aliasAnonymousUser', () => {
  it('aliases the anonymous id to the found user and calls next', () => {
    const next = jest.fn();
    aliasAnonymousUser(req({ foundUser: { id: 'u-9' } }, { 'x-anonymous-id': ANON }), {} as Response, next);
    expect(alias).toHaveBeenCalledWith(ANON, 'u-9');
    expect(next).toHaveBeenCalled();
  });

  it('passes nulls through when there is no anonymous id or user', () => {
    const next = jest.fn();
    aliasAnonymousUser(req(), {} as Response, next);
    expect(alias).toHaveBeenCalledWith(null, null);
    expect(next).toHaveBeenCalled();
  });
});
