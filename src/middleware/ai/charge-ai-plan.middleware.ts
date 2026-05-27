import { Request, Response, NextFunction } from 'express';
import { KarmaController } from '../../controllers/karma.controller';

/**
 * Factory that returns a middleware which charges 1 karma for ai_plan
 * unless planChangeResult.type === 'free_change' (change is minor and within limit).
 */
export function createChargeAiPlanMiddleware(karma: KarmaController) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.planChangeResult?.type === 'free_change') {
      // Free change: skip karma deduction
      return next();
    }
    // new_session or charged_change: deduct 1 karma as usual
    return karma.spendForAiPlan(req, res, next);
  };
}
