import { Request, Response, NextFunction } from 'express';
import { KarmaController } from '../../controllers/karma.controller';

/**
 * Charges ai_plan karma unless planChangeResult.type === 'free_change' (change is minor and within limit):
 * 9 for the F84 simple flow, 1 for advanced (its 8 were paid on /ai/suggest).
 */
export function createChargeAiPlanMiddleware(karma: KarmaController) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.planChangeResult?.type === 'free_change') {
      // Free change: skip karma deduction
      return next();
    }
    const spend = req.body.flow === 'simple' ? karma.spendForAiPlanSimple : karma.spendForAiPlan;
    return spend(req, res, next);
  };
}
