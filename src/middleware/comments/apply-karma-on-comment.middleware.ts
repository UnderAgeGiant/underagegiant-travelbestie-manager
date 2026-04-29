import { Request, Response, NextFunction } from 'express';
import { IKarmaRepository } from '../../repositories/interfaces/karma.repository';
import { MemoryCommentRepository } from '../../repositories/memory/memory-comment.repository';

export function makeApplyKarmaOnComment(karma: IKarmaRepository, comments: MemoryCommentRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.user!;
      const attractionId = req.params.attractionId;
      const isFirst = !(await comments.hasCommented(email, attractionId));
      if (isFirst) {
        comments.markCommented(email, attractionId);
        await karma.apply(email, +1);
      }
      next();
    } catch (err) { next(err); }
  };
}
