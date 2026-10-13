import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { ITripRepository } from '../repositories/interfaces/trip.repository';
import { IFollowRepository } from '../repositories/interfaces/follow.repository';
import { ITrophyRepository } from '../repositories/interfaces/trophy.repository';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { optionalAuth } from '../middleware/auth/optional-auth.middleware';
import { validateUsernameParam } from '../middleware/social/validate-username-param.middleware';
import { requireTargetUser } from '../middleware/social/require-target-user.middleware';
import { makeBuildPublicProfile } from '../middleware/social/build-public-profile.middleware';
import { respond } from '../middleware/respond.middleware';

/** Per-IP limits run first, so malformed/unknown usernames burn the same budget (anti-enumeration). */
export function createPublicProfileRouter(
  user: UserController, trips: ITripRepository, follows: IFollowRepository, trophies: ITrophyRepository,
): Router {
  const router = Router();
  router.get('/:username',
    rateLimitMiddleware({ keyPrefix: 'rl:u:min', windowSeconds: 60,    maxRequests: 30 }),
    rateLimitMiddleware({ keyPrefix: 'rl:u:day', windowSeconds: 86400, maxRequests: 200 }),
    optionalAuth,
    validateUsernameParam,
    user.findByUsernameParam,
    requireTargetUser,
    makeBuildPublicProfile(trips, follows, trophies),
    respond(200),
  );
  return router;
}
