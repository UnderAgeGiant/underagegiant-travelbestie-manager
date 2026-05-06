import { Request, Response, NextFunction } from 'express';
import { IKarmaRepository } from '../repositories/interfaces/karma.repository';

export class KarmaController {
  constructor(private readonly karma: IKarmaRepository) {}

  get = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const record = await this.karma.get(req.user!.email);
      req.result = { karma: record.score };
      next();
    } catch (err) { next(err); }
  };

  spend = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.karma.spend(req.user!.userId, req.trip!.id);
      next();
    } catch (err) { next(err); }
  };
}
