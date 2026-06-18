import { Request, Response, NextFunction } from 'express';
import { revokeRefreshToken } from '../../lib/refresh-tokens';
import { logger } from '../../lib/logger';

export async function revokeRefreshTokenMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await revokeRefreshToken(req.body.refreshToken as string);
  } catch (err) {
    logger.warn({ flowId: req.flowId, msg: 'revokeRefreshToken failed', err: String(err) });
  }
  next();
}
