import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { IUserRepository } from '../../repositories/interfaces/user.repository';
import { logger } from '../../lib/logger';

/** F79: when the INSERT after a claim fails, give the gift back and pass the error on. */
export function makeReleaseFirstPlanOnError(users: IUserRepository): ErrorRequestHandler {
  return async (err: unknown, req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (req.firstPlanClaimed) {
      try {
        await users.releaseFirstPlan(req.user!.userId);
        req.firstPlanClaimed = false;
      } catch (releaseErr) {
        logger.error({ msg: 'first-plan release failed', flowId: req.flowId, userId: req.user?.userId, err: releaseErr });
      }
    }
    next(err);
  };
}
