import { Request, Response, NextFunction } from 'express';
import { ICommentRepository } from '../repositories/interfaces/comment.repository';

export class CommentController {
  constructor(private readonly comments: ICommentRepository) {}

  add = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, text, rating, color, date } = req.body as { name: string; text: string; rating: number; color: string; date: string };
      req.result = await this.comments.add({
        attractionId: req.params.attractionId,
        name, text, rating, color, date,
        userId: req.user!.userId,
      });
      next();
    } catch (err) { next(err); }
  };

  findByAttraction = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.result = await this.comments.findByAttraction(req.params.attractionId);
      next();
    } catch (err) { next(err); }
  };
}
