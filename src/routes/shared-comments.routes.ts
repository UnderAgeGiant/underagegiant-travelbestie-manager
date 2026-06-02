import { Router } from 'express';
import { Pool } from 'pg';
import { StepCommentController } from '../controllers/step-comment.controller';
import { IStepCommentRepository } from '../repositories/interfaces/step-comment.repository';
import { IKarmaRepository } from '../repositories/interfaces/karma.repository';
import { makeResolveSharedTrip } from '../middleware/shared-comments/resolve-shared-trip.middleware';
import { makeAwardStepCommentKarma } from '../middleware/shared-comments/award-step-comment-karma.middleware';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { checkCommentCooldown } from '../middleware/comments/check-comment-cooldown.middleware';
import { checkCommentSimilarity } from '../middleware/comments/check-comment-similarity.middleware';
import { storeCommentRedis } from '../middleware/comments/store-comment-redis.middleware';
import { respond } from '../middleware/respond.middleware';

export function createSharedCommentsRouter(
  pool: Pool,
  controller: StepCommentController,
  stepCommentRepo: IStepCommentRepository,
  karmaRepo: IKarmaRepository,
): Router {
  const router = Router({ mergeParams: true });
  const resolveSharedTrip     = makeResolveSharedTrip(pool);
  const awardStepCommentKarma = makeAwardStepCommentKarma(stepCommentRepo, karmaRepo);

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
    validate({ text: { required: true, minLength: 50 } }),
    controller.add,
    awardStepCommentKarma,
    storeCommentRedis,
    respond(201),
  );

  return router;
}
