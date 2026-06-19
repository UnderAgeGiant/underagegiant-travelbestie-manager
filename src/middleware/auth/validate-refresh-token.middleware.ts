import { Request, Response, NextFunction } from 'express';
import { validateAndRotate } from '../../lib/refresh-tokens';
import { respondError } from '../../lib/respond-error';

export async function validateRefreshTokenMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await validateAndRotate(req.body.refreshToken as string);
    if (!result) {
      respondError(req, res, 401, { error: 'INVALID_REFRESH_TOKEN' });
      return;
    }
    req.tokenUserId       = result.userId;
    req.newRawRefreshToken = result.newRaw;
    next();
  } catch (err) { next(err); }
}
