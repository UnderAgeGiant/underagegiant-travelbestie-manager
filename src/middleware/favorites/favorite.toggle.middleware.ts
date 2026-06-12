import { Request, Response, NextFunction } from 'express';
import { IFavoriteRepository } from '../../repositories/interfaces/favorite.repository.interface';
import { SharedTripPayload } from '../../types';

export function makeFavoriteToggle(repo: IFavoriteRepository) {
  return async function favoriteToggle(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const source = req.result as SharedTripPayload;
    const userId = req.user!.userId;

    req.result = await repo.toggle(userId, source.tripId);
    next();
  };
}
