import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { IKarmaRepository } from '../../repositories/interfaces/karma.repository';
import { logger } from '../../lib/logger';
import { respondError } from '../../lib/respond-error';

/**
 * /ai/suggest: a failure after the charge (DeepSeek error, truncated or invalid output) gives the
 * Tokens back — one ai_suggest_refund row, ref_id = this request's flowId — and answers
 * 500 { error: 'ai_suggest_failed' }. Errors before the charge (402, a failed spend) pass through.
 */
export function makeRefundAiSuggestOnError(karma: IKarmaRepository): ErrorRequestHandler {
  return async (err: Error, req: Request, res: Response, next: NextFunction): Promise<void> => {
    const charged = req.karmaCharged ?? 0;
    if (charged === 0) return next(err);

    logger.error({ msg: 'AI suggest failed after the charge', flowId: req.flowId, userId: req.user!.userId, err: err.message, stack: err.stack });
    try {
      await karma.award(req.user!.userId, charged, 'ai_suggest_refund', req.flowId);
      req.karmaCharged = 0;
    } catch (refundErr) {
      logger.error({ msg: 'Failed to refund karma after AI suggest failure', flowId: req.flowId, userId: req.user!.userId, err: refundErr });
    }
    respondError(req, res, 500, { error: 'ai_suggest_failed' });
  };
}
