import { Request, Response, NextFunction, RequestHandler } from 'express';
import { IUserRepository } from '../../repositories/interfaces/user.repository';
import { logger } from '../../lib/logger';

/**
 * F79: takes the free first plan when it is still available (one atomic UPDATE).
 * Never rejects: a repo error logs a warning and the request pays as usual.
 */
export function makeClaimFirstPlanIfAvailable(users: IUserRepository): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.firstPlanClaimed = await users.claimFirstPlan(req.user!.userId);
    } catch (err) {
      logger.warn({ msg: 'first-plan claim failed; charging as usual', flowId: req.flowId, userId: req.user?.userId, err });
      req.firstPlanClaimed = false;
    }
    next();
  };
}
