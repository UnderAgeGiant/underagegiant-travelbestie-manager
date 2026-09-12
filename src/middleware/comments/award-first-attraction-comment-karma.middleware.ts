import { Request, Response, NextFunction } from 'express';
import { ICommentRepository } from '../../repositories/interfaces/comment.repository';
import { IKarmaRepository } from '../../repositories/interfaces/karma.repository';
import { Comment } from '../../types';
import { logger } from '../../lib/logger';

export function makeAwardFirstAttractionCommentKarma(
  comments: ICommentRepository,
  karma: IKarmaRepository,
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.user!;
      const { attractionId } = req.params;
      const comment = req.result as Comment;

      const first = await comments.markFirstAttractionComment(userId, attractionId);
      if (first) {
        await karma.award(userId, 1, 'attraction_comment_first', comment.id);
      }
    } catch (err) {
      logger.warn({ flowId: req.flowId, msg: 'Failed to award first attraction comment karma', err });
    }
    next();
  };
}
