jest.mock('../src/lib/redis', () => ({ redis: { set: jest.fn(), get: jest.fn(), del: jest.fn() } }));

import { generateOtpCode } from '../src/lib/otp';

describe('generateOtpCode (B-3)', () => {
  it('always returns a 6-digit numeric string', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(Number(code)).toBeGreaterThanOrEqual(100000);
      expect(Number(code)).toBeLessThanOrEqual(999999);
    }
  });

  it('does not call the non-crypto Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    generateOtpCode();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
