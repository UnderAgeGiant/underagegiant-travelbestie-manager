import { Router } from 'express';
import { ReferralController } from '../controllers/referral.controller';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { rejectMalformedCode, requireInviter } from '../middleware/referrals/require-inviter.middleware';
import { respond } from '../middleware/respond.middleware';

/** F81 Referral Tokens (contracts §19.1–19.2). `/me` must stay before `/:code`. Neither response is cached. */
export function createReferralsRouter(referral: ReferralController): Router {
  const router = Router();

  router.get('/me',
    requireAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:ref-me', windowSeconds: 60, maxRequests: 60, getKey: req => req.user!.userId }),
    referral.code,
    referral.summary,
    respond(200),
  );

  // Public: the sign-up line "@ana te invitó". Only username + first name, never ids or email.
  router.get('/:code',
    rateLimitMiddleware({ keyPrefix: 'rl:ref-lookup', windowSeconds: 900, maxRequests: 20 }),
    rejectMalformedCode,
    referral.findInviter,
    requireInviter,
    respond(200),
  );

  return router;
}
