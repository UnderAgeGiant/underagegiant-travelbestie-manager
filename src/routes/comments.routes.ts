import { Router } from 'express';
import { CommentController } from '../controllers/comment.controller';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { validateRating } from '../middleware/comments/validate-rating.middleware';
import { injectCommentAuthor } from '../middleware/comments/inject-comment-author.middleware';
import { checkCommentCooldown } from '../middleware/comments/check-comment-cooldown.middleware';
import { checkCommentSimilarity } from '../middleware/comments/check-comment-similarity.middleware';
import { storeCommentRedis } from '../middleware/comments/store-comment-redis.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { readCommentsBatchCache, writeCommentsBatchCache } from '../middleware/comments/comments-batch-cache.middleware';
import { respond } from '../middleware/respond.middleware';

export function createCommentsRouter(comment: CommentController): Router {
  const router = Router();

  router.get('/',
    rateLimitMiddleware({ keyPrefix: 'rl:comments_batch', windowSeconds: 60, maxRequests: 60 }),
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
    validate({ text: { required: true }, rating: { required: true }, color: { required: true }, date: { required: true } }),
    validateRating,
    comment.add,
    storeCommentRedis,
    respond(201),
  );

  return router;
}
