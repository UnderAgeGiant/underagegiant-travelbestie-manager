import { Request, Response, NextFunction } from 'express';
import { revokeRefreshToken } from '../../lib/refresh-tokens';
import { logger } from '../../lib/logger';
import { REFRESH_COOKIE, clearRefreshCookie } from '../../lib/refresh-cookie';

export async function revokeRefreshTokenMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (raw) {
    try {
      await revokeRefreshToken(raw);
    } catch (err) {
      logger.warn({ flowId: req.flowId, msg: 'revokeRefreshToken failed', err: String(err) });
    }
  }
  clearRefreshCookie(res); // always expire the cookie on logout, even if Redis DEL failed
  next();
}
