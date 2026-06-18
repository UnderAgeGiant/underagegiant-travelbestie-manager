import { issueRefreshToken, validateAndRotate, revokeRefreshToken, invalidateUserSessions } from '../../src/lib/refresh-tokens';

jest.mock('../../src/lib/redis', () => ({
  redis: {
    set:  jest.fn().mockResolvedValue('OK'),
    get:  jest.fn(),
    del:  jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
  },
}));

const r = (jest.requireMock('../../src/lib/redis') as {
  redis: { set: jest.Mock; get: jest.Mock; del: jest.Mock; incr: jest.Mock };
}).redis;

const USER_ID = 'user-uuid-1';

beforeEach(() => jest.clearAllMocks());

describe('issueRefreshToken', () => {
  it('stores a hashed key in Redis with 86400 TTL and returns raw token', async () => {
    r.get.mockResolvedValue(null);  // session_version → '0' (null → default '0')
    const raw = await issueRefreshToken(USER_ID);
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(r.set).toHaveBeenCalledWith(
      expect.stringMatching(/^refresh:[0-9a-f]{64}$/),
      `${USER_ID}|0`,
      'EX',
      86400,
    );
  });
});

describe('validateAndRotate', () => {
  it('returns null when token not found', async () => {
    r.get.mockResolvedValue(null);
    expect(await validateAndRotate('nonexistent')).toBeNull();
  });

  it('returns null when session version has been incremented (password changed)', async () => {
    r.get
      .mockResolvedValueOnce(`${USER_ID}|2`)  // token key: stored version 2
      .mockResolvedValueOnce('3');             // session_version key: current version 3
    expect(await validateAndRotate('some-token')).toBeNull();
  });

  it('deletes old key, writes new key, returns userId + new raw token', async () => {
    r.get
      .mockResolvedValueOnce(`${USER_ID}|0`)  // token key
      .mockResolvedValueOnce(null);            // session_version key → '0'
    const result = await validateAndRotate('valid-token');
    expect(result).not.toBeNull();
    expect(result!.userId).toBe(USER_ID);
    expect(result!.newRaw).toMatch(/^[0-9a-f]{64}$/);
    expect(r.del).toHaveBeenCalledTimes(1);
    expect(r.set).toHaveBeenCalledWith(
      expect.stringMatching(/^refresh:[0-9a-f]{64}$/),
      `${USER_ID}|0`,
      'EX',
      86400,
    );
  });
});

describe('revokeRefreshToken', () => {
  it('calls DEL on the hashed key', async () => {
    await revokeRefreshToken('some-raw-token');
    expect(r.del).toHaveBeenCalledWith(expect.stringMatching(/^refresh:[0-9a-f]{64}$/));
  });
});

describe('invalidateUserSessions', () => {
  it('increments session_version for the userId', async () => {
    await invalidateUserSessions(USER_ID);
    expect(r.incr).toHaveBeenCalledWith(`session_version:${USER_ID}`);
  });
});
