import { Request, Response, NextFunction } from 'express';
import { IStepCommentRepository } from '../repositories/interfaces/step-comment.repository';

export class StepCommentController {
  constructor(private readonly stepComments: IStepCommentRepository) {}

  getAll = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.result = await this.stepComments.getAllForTrip(req.sharedTripMeta!.tripId);
      next();
    } catch (err) { next(err); }
  };

  add = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const comment = await this.stepComments.add({
        tripId:     req.sharedTripMeta!.tripId,
        stepKey:    req.params.stepKey,
        userId:     req.user!.userId,
        authorName: req.user!.name,
        text:       req.body.text as string,
      });
      req.result = { comment, karmaAwarded: false };
      next();
    } catch (err) { next(err); }
  };
}
