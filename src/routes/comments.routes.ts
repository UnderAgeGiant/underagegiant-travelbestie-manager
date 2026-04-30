import { Router } from 'express';
import { CommentController } from '../controllers/comment.controller';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { validateRating } from '../middleware/comments/validate-rating.middleware';
import { injectCommentAuthor } from '../middleware/comments/inject-comment-author.middleware';
import { respond } from '../middleware/respond.middleware';

export function createCommentsRouter(comment: CommentController): Router {
  const router = Router();

  router.get('/:attractionId',
    comment.findByAttraction,
    respond(200),
  );

  router.post('/:attractionId',
    requireAuth,
    injectCommentAuthor,
    validate({ text: { required: true }, rating: { required: true }, color: { required: true }, date: { required: true } }),
    validateRating,
    comment.add,
    respond(201),
  );

  return router;
}
