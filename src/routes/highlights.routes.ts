import { Router } from 'express';
import { IHighlightRepository } from '../repositories/interfaces/highlight.repository.interface';
import { optionalAuth } from '../middleware/auth/optional-auth.middleware';
import { validateHighlightType } from '../middleware/highlights/validate-highlight-type.middleware';
import { makeCheckHighlightSeen } from '../middleware/highlights/check-highlight-seen.middleware';
import { makeMarkHighlightSeen } from '../middleware/highlights/mark-highlight-seen.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { highlightIdentity } from '../lib/highlight-identity';
import { respond } from '../middleware/respond.middleware';
import { logCtaEvent } from '../lib/log-event';

export function createHighlightsRouter(repo: IHighlightRepository): Router {
  const router = Router();
  const checkHighlightSeen = makeCheckHighlightSeen(repo);
  const markHighlightSeen  = makeMarkHighlightSeen(repo);

  router.get('/:type/status',
    validateHighlightType,
    optionalAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:highlight-status', windowSeconds: 60, maxRequests: 60, getKey: highlightIdentity }),
    checkHighlightSeen,
  );

  router.post('/:type/seen',
    validateHighlightType,
    optionalAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:highlight-seen', windowSeconds: 60, maxRequests: 30, getKey: highlightIdentity }),
    markHighlightSeen,
    logCtaEvent('cta_highlight_seen', req => ({ type: req.params.type, anonymous: !req.user })),
    respond(204),
  );

  return router;
}
