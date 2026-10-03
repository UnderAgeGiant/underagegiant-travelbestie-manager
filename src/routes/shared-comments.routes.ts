import { Router } from 'express';
import { Pool } from 'pg';
import { StepCommentController } from '../controllers/step-comment.controller';
import { IStepCommentRepository } from '../repositories/interfaces/step-comment.repository';
import { IKarmaRepository } from '../repositories/interfaces/karma.repository';
import { INotificationRepository } from '../repositories/interfaces/notification.repository';
import { TrophyRecorder } from '../lib/trophy-recorder';
import { makeResolveSharedTrip } from '../middleware/shared-comments/resolve-shared-trip.middleware';
import { makeAwardStepCommentKarma } from '../middleware/shared-comments/award-step-comment-karma.middleware';
import { makeNotifyStepComment } from '../middleware/notifications/notify-step-comment.middleware';
import { makeRecordTrophy } from '../middleware/trophies/record-trophy.middleware';
import { commentTarget } from '../middleware/trophies/trophy-targets';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { validateBody } from '../middleware/validate-body.middleware';
import { addStepCommentSchema } from '../schemas/comment.schemas';
import { checkCommentCooldown } from '../middleware/comments/check-comment-cooldown.middleware';
import { checkCommentSimilarity } from '../middleware/comments/check-comment-similarity.middleware';
import { storeCommentRedis } from '../middleware/comments/store-comment-redis.middleware';
import { respond } from '../middleware/respond.middleware';

export function createSharedCommentsRouter(
  pool: Pool,
  controller: StepCommentController,
  stepCommentRepo: IStepCommentRepository,
  karmaRepo: IKarmaRepository,
  notificationRepo: INotificationRepository,
  trophies?: TrophyRecorder,
): Router {
  const router = Router({ mergeParams: true });
  const resolveSharedTrip     = makeResolveSharedTrip(pool);
  const awardStepCommentKarma = makeAwardStepCommentKarma(stepCommentRepo, karmaRepo);
  const notifyStepComment     = makeNotifyStepComment(notificationRepo);

  // GET /shared/:shareId/comments
  router.get('/',
    resolveSharedTrip,
    controller.getAll,
    respond(200),
  );

  // POST /shared/:shareId/comments/:stepKey
  router.post('/:stepKey',
    requireAuth,
    resolveSharedTrip,
    checkCommentCooldown,
    checkCommentSimilarity,
    validateBody(addStepCommentSchema),
    controller.add,
    awardStepCommentKarma,
    storeCommentRedis,
    notifyStepComment,
    makeRecordTrophy(trophies, 'comments', commentTarget),
    respond(201),
  );

  return router;
}
