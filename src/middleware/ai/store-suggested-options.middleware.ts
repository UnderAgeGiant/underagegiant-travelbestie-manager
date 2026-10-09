import { Request, Response, NextFunction } from 'express';
import { storeSuggestedOptions } from '../../lib/suggested-options-store';
import { appendSuggestHistory } from '../../lib/suggest-history';
import type { AiSuggestBody } from '../../schemas/ai.schemas';
import type { SuggestTripsResponse } from '../../types';

/** Runs after ai.suggest: remembers the sanitized options so /ai/plan can trust them instead of the client's copy. */
export const storeSuggestedOptionsMiddleware = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const planSessionId = (req.body as AiSuggestBody).planSessionId;
  if (planSessionId) {
    const { options } = req.result as SuggestTripsResponse;
    await storeSuggestedOptions(req.user!.userId, planSessionId, options);
    await appendSuggestHistory(req.user!.userId, planSessionId, options);
  }
  next();
};
