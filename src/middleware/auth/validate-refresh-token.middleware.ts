import { Request, Response, NextFunction } from 'express';
import { validateAndRotate } from '../../lib/refresh-tokens';
import { respondError } from '../../lib/respond-error';
import { REFRESH_COOKIE, clearRefreshCookie } from '../../lib/refresh-cookie';

export async function validateRefreshTokenMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) {
      respondError(req, res, 401, { error: 'INVALID_REFRESH_TOKEN' });
      return;
    }
    const result = await validateAndRotate(raw);
    if (!result) {
      clearRefreshCookie(res); // stale/rotated token — tell the browser to drop it
      respondError(req, res, 401, { error: 'INVALID_REFRESH_TOKEN' });
      return;
    }
    req.tokenUserId        = result.userId;
    req.newRawRefreshToken = result.newRaw;
    next();
  } catch (err) { next(err); }
}
