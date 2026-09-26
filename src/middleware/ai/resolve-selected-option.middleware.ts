import { Request, Response, NextFunction } from 'express';
import { loadSuggestedOptions } from '../../lib/suggested-options-store';
import { respondError } from '../../lib/respond-error';
import { logger } from '../../lib/logger';
import type { AiPlanBody } from '../../schemas/ai.schemas';

/**
 * Replaces the client-sent selectedOption with the copy /ai/suggest stored for this
 * user + planSessionId, so free text the client sends back never reaches the prompt.
 * Redis errors fall back to the client copy (Redis failures are non-fatal project-wide).
 */
export const resolveSelectedOption = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const body = req.body as AiPlanBody;
  if (!body.planSessionId) {
    respondError(req, res, 400, { error: 'planSessionId is required' }); return;
  }

  let stored;
  try {
    stored = await loadSuggestedOptions(req.user!.userId, body.planSessionId);
  } catch (err) {
    logger.warn({ msg: 'Failed to load suggested options; using client copy', userId: req.user!.userId, err });
    return next();
  }

  if (!stored) {
    respondError(req, res, 409, { error: 'Suggested options expired — generate new suggestions' }); return;
  }
  const match = stored.find(o => o.id === body.selectedOption.id);
  if (!match) {
    respondError(req, res, 400, { error: 'selectedOption does not match the generated suggestions' }); return;
  }
  req.body.selectedOption = match;
  next();
};
