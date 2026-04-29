import { Router } from 'express';
import { CommentController } from '../controllers/comment.controller';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { validateRating } from '../middleware/comments/validate-rating.middleware';
import { injectCommentAuthor } from '../middleware/comments/inject-comment-author.middleware';
import { makeApplyKarmaOnComment } from '../middleware/comments/apply-karma-on-comment.middleware';
import { respond } from '../middleware/respond.middleware';
import { IKarmaRepository } from '../repositories/interfaces/karma.repository';
import { MemoryCommentRepository } from '../repositories/memory/memory-comment.repository';

export function createCommentsRouter(comment: CommentController, karmaRepo: IKarmaRepository, commentRepo: MemoryCommentRepository): Router {
  const router = Router();
  const applyKarmaOnComment = makeApplyKarmaOnComment(karmaRepo, commentRepo);

  router.get('/:attractionId',
    comment.findByAttraction,
    respond(200)
  );

  router.post('/:attractionId',
    requireAuth,
    injectCommentAuthor,
    validate({ text: { required: true }, rating: { required: true }, color: { required: true }, date: { required: true } }),
    validateRating,
    comment.add,
    applyKarmaOnComment,
    respond(201)
  );

  return router;
}
