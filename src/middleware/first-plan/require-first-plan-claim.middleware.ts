import { Request, Response, NextFunction, RequestHandler } from 'express';
import { IUserRepository } from '../../repositories/interfaces/user.repository';
import { respondError } from '../../lib/respond-error';

/** F79 POST /ai/first-plan: claims the gift or rejects 409 first_plan_used (used, or held by a run in another tab). */
export function makeRequireFirstPlanClaim(users: IUserRepository): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!(await users.claimFirstPlan(req.user!.userId))) {
        respondError(req, res, 409, { error: 'first_plan_used' });
        return;
      }
      req.firstPlanClaimed = true;
      next();
    } catch (err) { next(err); }
  };
}
