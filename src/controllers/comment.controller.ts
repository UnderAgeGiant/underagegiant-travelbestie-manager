import { Request, Response, NextFunction } from 'express';
import { ICommentRepository } from '../repositories/interfaces/comment.repository';

const MAX_IDS = 50;

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

  findByAttractions = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = req.query.ids;
      if (!raw || typeof raw !== 'string' || raw.trim() === '') {
        _res.status(400).json({ error: 'ids query param required' });
        return;
      }
      const ids = [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))];
      if (ids.length === 0) {
        _res.status(400).json({ error: 'ids query param required' });
        return;
      }
      if (ids.length > MAX_IDS) {
        _res.status(400).json({ error: 'too many ids' });
        return;
      }
      req.result = await this.comments.findByAttractions(ids);
      next();
    } catch (err) { next(err); }
  };
}
