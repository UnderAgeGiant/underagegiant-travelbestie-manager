import { Router } from 'express';
import { CommentController } from '../controllers/comment.controller';
import { ICommentRepository } from '../repositories/interfaces/comment.repository';
import { IKarmaRepository } from '../repositories/interfaces/karma.repository';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { validateBody } from '../middleware/validate-body.middleware';
import { addCommentSchema } from '../schemas/comment.schemas';
import { validateRating } from '../middleware/comments/validate-rating.middleware';
import { injectCommentAuthor } from '../middleware/comments/inject-comment-author.middleware';
import { checkCommentCooldown } from '../middleware/comments/check-comment-cooldown.middleware';
import { checkCommentSimilarity } from '../middleware/comments/check-comment-similarity.middleware';
import { storeCommentRedis } from '../middleware/comments/store-comment-redis.middleware';
import { makeAwardFirstAttractionCommentKarma } from '../middleware/comments/award-first-attraction-comment-karma.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { readCommentsBatchCache, writeCommentsBatchCache } from '../middleware/comments/comments-batch-cache.middleware';
import { respond } from '../middleware/respond.middleware';
import { logCtaEvent } from '../lib/log-event';

export function createCommentsRouter(
  comment: CommentController,
  commentRepo: ICommentRepository,
  karma: IKarmaRepository,
): Router {
  const router = Router();

  router.get('/',
    rateLimitMiddleware({ keyPrefix: 'rl:comments:batch', windowSeconds: 60, maxRequests: 60 }),
    readCommentsBatchCache,
    comment.findByAttractions,
    writeCommentsBatchCache,
    respond(200),
  );

  router.get('/:attractionId',
    comment.findByAttraction,
    respond(200),
  );

  router.post('/:attractionId',
    requireAuth,
    checkCommentCooldown,
    checkCommentSimilarity,
    injectCommentAuthor,
    validateBody(addCommentSchema),
    validateRating,
    comment.add,
    makeAwardFirstAttractionCommentKarma(commentRepo, karma),
    logCtaEvent('cta_comment_post', req => ({ attractionId: req.params.attractionId })),
    storeCommentRedis,
    respond(201),
  );

  return router;
}
