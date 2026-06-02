import { Request, Response, NextFunction } from 'express';
import { IStepCommentRepository } from '../../repositories/interfaces/step-comment.repository';
import { IKarmaRepository } from '../../repositories/interfaces/karma.repository';
import { StepCommentAddResult } from '../../types';
import { logger } from '../../lib/logger';

export function makeAwardStepCommentKarma(
  stepComments: IStepCommentRepository,
  karma: IKarmaRepository,
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.user!;
      const { tripId, ownerId } = req.sharedTripMeta!;
      const result = req.result as StepCommentAddResult;

      const isOwner = userId === ownerId;

      if (!isOwner) {
        const first = await stepComments.isFirstCommentOnStep(userId, tripId, req.params.stepKey);
        if (first) {
          await karma.award(userId, 1, 'step_comment', result.comment.id);
          result.karmaAwarded = true;
        }
      }
    } catch (err) {
      logger.warn({ flowId: req.flowId, msg: 'Failed to award step comment karma', err });
    }
    next();
  };
}
