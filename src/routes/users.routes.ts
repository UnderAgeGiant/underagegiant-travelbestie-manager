import { Router, Request } from 'express';
import { UserController } from '../controllers/user.controller';
import { IFollowRepository } from '../repositories/interfaces/follow.repository';
import { INotificationRepository } from '../repositories/interfaces/notification.repository';
import { TrophyRecorder } from '../lib/trophy-recorder';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { validateUsernameParam } from '../middleware/social/validate-username-param.middleware';
import { requireTargetUser } from '../middleware/social/require-target-user.middleware';
import { rejectSelfFollow } from '../middleware/social/reject-self-follow.middleware';
import { makeFollow, makeUnfollow } from '../middleware/social/follow.middleware';
import { makeNotifyNewFollower } from '../middleware/social/notify-new-follower.middleware';
import { makeRecordTrophy } from '../middleware/trophies/record-trophy.middleware';
import { followerTarget } from '../middleware/trophies/trophy-targets';
import { respond } from '../middleware/respond.middleware';

const byUser = (req: Request): string => req.user?.userId ?? req.ip ?? 'unknown';

export function createUsersRouter(
  user: UserController, followRepo: IFollowRepository, notificationRepo: INotificationRepository, recorder?: TrophyRecorder,
): Router {
  const router = Router();
  const limit = rateLimitMiddleware({ keyPrefix: 'rl:follow', windowSeconds: 60, maxRequests: 30, getKey: byUser });

  router.post('/:username/follow',
    requireAuth, limit, validateUsernameParam, user.findByUsernameParam, requireTargetUser, rejectSelfFollow,
    makeFollow(followRepo),
    user.findById,                                       // the follower (name + username for the notification)
    makeNotifyNewFollower(followRepo, notificationRepo),
    makeRecordTrophy(recorder, 'followers', followerTarget),
    respond(204),
  );

  router.delete('/:username/follow',
    requireAuth, limit, validateUsernameParam, user.findByUsernameParam, requireTargetUser,
    makeUnfollow(followRepo),
    respond(204),
  );

  return router;
}
