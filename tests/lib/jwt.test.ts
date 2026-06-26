import jwt from 'jsonwebtoken';
import { signToken } from '../../src/lib/jwt';

describe('signToken', () => {
  it('issues an access token valid for 2 hours by default', () => {
    delete process.env.JWT_EXPIRES_IN;
    const token = signToken({ userId: 'u-1', email: 'a@b.com', name: 'Ana' });
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(2 * 60 * 60); // 7200 s
  });
});
