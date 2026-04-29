import { Request, Response, NextFunction } from 'express';
import { IKarmaRepository } from '../../repositories/interfaces/karma.repository';

export function makeApplyKarmaOnTrip(karma: IKarmaRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await karma.apply(req.user!.email, -1);
      next();
    } catch (err) { next(err); }
  };
}
