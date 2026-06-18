import { Request, Response, NextFunction } from 'express';
import { invalidateUserSessions } from '../../lib/refresh-tokens';
import { logger } from '../../lib/logger';

export async function invalidateSessionsMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.newPasswordHash) { next(); return; }
  try {
    await invalidateUserSessions(req.user!.userId);
  } catch (err) {
    logger.warn({ flowId: req.flowId, msg: 'invalidateUserSessions failed', err: String(err) });
  }
  next();
}
