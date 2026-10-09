import { Request, Response, NextFunction, RequestHandler } from 'express';
import {
  loadSuggestHistory, loadSuggestQueue, saveSuggestQueue, suggestInputsHash, takeSuggestionPage, restrictToMentionedCities,
} from '../../lib/suggest-history';
import { SUGGEST_PAGE_SIZE } from '../../lib/ai-limits';
import type { AiSuggestBody } from '../../schemas/ai.schemas';
import type { SuggestTripsResponse } from '../../types';

/** Before ai.suggest: every option already shown in this planning session (empty without a planSessionId or on Redis error). */
export const loadSuggestHistoryMiddleware = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const planSessionId = (req.body as AiSuggestBody).planSessionId;
  req.suggestHistory = planSessionId ? await loadSuggestHistory(req.user!.userId, planSessionId) : [];
  next();
};

/** Before ai.suggest: if the last DeepSeek batch for these exact inputs still has unseen options, serve the next page from it (no DeepSeek call). */
export const serveQueuedSuggestionsMiddleware = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const body = req.body as AiSuggestBody;
  if (!body.planSessionId) { next(); return; }
  const userId = req.user!.userId;
  const queue = await loadSuggestQueue(userId, body.planSessionId);
  // Queued options are unseen by construction (saved from the unseen rest, replaced on every fresh batch).
  // A leftover smaller than a page triggers a fresh call rather than a one-card response.
  if (queue && queue.options.length >= SUGGEST_PAGE_SIZE && queue.inputsHash === suggestInputsHash(body)) {
    const { page, rest } = takeSuggestionPage(queue.options, req.suggestHistory ?? [], SUGGEST_PAGE_SIZE);
    await saveSuggestQueue(userId, body.planSessionId, { inputsHash: queue.inputsHash, options: rest });
    req.result = { options: page };
    req.suggestServedFromQueue = true;
  }
  next();
};

/** Runs `fn` only when no earlier middleware already produced the response (queue hit). */
export function unlessServedFromQueue(fn: RequestHandler): RequestHandler {
  return (req, res, next) => (req.suggestServedFromQueue ? next() : fn(req, res, next));
}

/** After a fresh ai.suggest: keep only options inside the cities the traveler named, show the first unseen page, queue the unseen rest. */
export const takeFreshSuggestionPageMiddleware = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const body = req.body as AiSuggestBody;
  const inScope = restrictToMentionedCities((req.result as SuggestTripsResponse).options, body.preferences, body.cityIndex);
  const { page, rest } = takeSuggestionPage(inScope, req.suggestHistory ?? [], SUGGEST_PAGE_SIZE);
  req.result = { options: page };
  if (body.planSessionId) {
    await saveSuggestQueue(req.user!.userId, body.planSessionId, { inputsHash: suggestInputsHash(body), options: rest });
  }
  next();
};
