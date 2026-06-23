import { Response, CookieOptions } from 'express';
import { REFRESH_TTL } from './refresh-tokens';

export const REFRESH_COOKIE = 'tb_refresh_token';

function baseOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,                       // Secure cannot be set over http://localhost in dev
    sameSite: isProd ? 'none' : 'lax',    // cross-site in prod needs None; dev is same-site (localhost)
    path: '/auth',                        // only /auth/refresh and /auth/logout need it
  };
}

/** Persist the raw refresh token as an HttpOnly cookie the browser JS cannot read. */
export function setRefreshCookie(res: Response, rawToken: string): void {
  res.cookie(REFRESH_COOKIE, rawToken, {
    ...baseOptions(),
    maxAge: REFRESH_TTL * 1000,           // match the Redis TTL (1 day)
  });
}

/** Expire the refresh cookie (logout / invalid token). Options must match for the browser to clear it. */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions());
}
