import { Request, Response, NextFunction } from 'express';
import { invalidateUserSessions } from '../../lib/refresh-tokens';
import { logger } from '../../lib/logger';

export async function invalidateSessionsMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.userId ?? req.foundUser?.id;
  if (!req.newPasswordHash || !userId) { next(); return; }
  try {
    await invalidateUserSessions(userId);
  } catch (err) {
    logger.warn({ flowId: req.flowId, msg: 'invalidateUserSessions failed', err: String(err) });
  }
  next();
}
