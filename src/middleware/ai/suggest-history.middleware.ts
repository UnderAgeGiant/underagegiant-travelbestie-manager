import { Request, Response, NextFunction } from 'express';
import { loadSuggestHistory, dropRepeatedSuggestions } from '../../lib/suggest-history';
import type { AiSuggestBody } from '../../schemas/ai.schemas';
import type { SuggestTripsResponse } from '../../types';

/** Before ai.suggest: every option already shown in this planning session (empty without a planSessionId or on Redis error). */
export const loadSuggestHistoryMiddleware = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const planSessionId = (req.body as AiSuggestBody).planSessionId;
  req.suggestHistory = planSessionId ? await loadSuggestHistory(req.user!.userId, planSessionId) : [];
  next();
};

/** After ai.suggest: drops options whose route was already shown (never empties the list). */
export const dropRepeatedSuggestionsMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const result = req.result as SuggestTripsResponse;
  req.result = { options: dropRepeatedSuggestions(result.options, req.suggestHistory ?? []) };
  next();
};
