import { Request, Response, NextFunction } from 'express';
import { IFavoriteRepository } from '../../repositories/interfaces/favorite.repository.interface';
import { SharedTripPayload } from '../../types';

export function makeAttachFavoriteMeta(repo: IFavoriteRepository) {
  return async function attachFavoriteMeta(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const payload = req.result as SharedTripPayload;
    const userId  = req.user?.userId ?? null;

    try {
      const meta = await repo.getCountAndStatus(payload.tripId, userId);
      req.result = { ...payload, ...meta };
    } catch {
      // Non-fatal — serve the trip without favorite metadata rather than 500
      req.result = { ...payload, favoriteCount: 0, isFavoritedByMe: false };
    }

    next();
  };
}
