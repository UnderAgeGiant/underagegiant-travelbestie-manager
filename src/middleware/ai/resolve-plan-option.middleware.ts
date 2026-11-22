import { Request, Response, NextFunction } from 'express';
import { respondError } from '../../lib/respond-error';
import { buildCitiesPlanOption } from '../../lib/cities-plan-option';
import { resolveSelectedOption } from './resolve-selected-option.middleware';
import type { AiPlanBody } from '../../schemas/ai.schemas';

/**
 * POST /ai/plan option step. Simple flow (F84): no /ai/suggest ran, so the option is synthesized
 * from `cities` (same helper as the F79 first run) and `cityIds` set from them. Advanced: the
 * stored /ai/suggest copy replaces the client's (resolveSelectedOption).
 */
export const resolvePlanOption = (req: Request, res: Response, next: NextFunction): void | Promise<void> => {
  const body = req.body as AiPlanBody;
  if (body.flow !== 'simple') return resolveSelectedOption(req, res, next);
  if (!body.planSessionId) { respondError(req, res, 400, { error: 'planSessionId is required' }); return; }
  req.body.selectedOption = buildCitiesPlanOption(body.cities!, body.duration!);
  req.body.cityIds = body.cities!.map(c => c.id);
  next();
};
