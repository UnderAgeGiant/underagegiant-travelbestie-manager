const mockRedis = {
  incr:   jest.fn(),
  expire: jest.fn().mockResolvedValue(1),
  del:    jest.fn().mockResolvedValue(1),
};
jest.mock('../src/lib/redis', () => ({ redis: mockRedis }));

import { registerFailedAttempt, clearAttempts, MAX_OTP_ATTEMPTS } from '../src/lib/otp-attempts';

describe('otp-attempts (B-7)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns false (not locked) while under the limit', async () => {
    mockRedis.incr.mockResolvedValue(1);
    expect(await registerFailedAttempt('reset', 'a@test.com')).toBe(false);
  });

  it('sets a TTL on the first failed attempt', async () => {
    mockRedis.incr.mockResolvedValue(1);
    await registerFailedAttempt('reset', 'a@test.com');
    expect(mockRedis.expire).toHaveBeenCalledWith('otp:attempts:reset:a@test.com', 900);
  });

  it('returns true (locked) once attempts exceed MAX_OTP_ATTEMPTS', async () => {
    mockRedis.incr.mockResolvedValue(MAX_OTP_ATTEMPTS + 1);
    expect(await registerFailedAttempt('reset', 'a@test.com')).toBe(true);
  });

  it('fails open (returns false) when Redis throws', async () => {
    mockRedis.incr.mockRejectedValue(new Error('down'));
    expect(await registerFailedAttempt('reset', 'a@test.com')).toBe(false);
  });

  it('clearAttempts deletes the counter key', async () => {
    await clearAttempts('reset', 'A@Test.com');
    expect(mockRedis.del).toHaveBeenCalledWith('otp:attempts:reset:a@test.com');
  });
});
