import { Request, Response, NextFunction } from 'express';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';
import { logger } from '../../lib/logger';
import { FavoriteToggleResult } from '../../types';

/**
 * Store an in-app notification for the trip owner when someone favorites their
 * shared trip. Fires only on favorited=true (never on unfavorite) and never for
 * self-favorites. Non-fatal — never blocks the response.
 */
export function makeNotifyFavorite(notificationRepo: INotificationRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const meta = req.sharedTripMeta;
      const result = req.result as FavoriteToggleResult | undefined;
      if (meta && result?.favorited && req.user!.userId !== meta.ownerId) {
        await notificationRepo.add({
          userId: meta.ownerId,
          type:  'favorite',
          title: '⭐ Nuevo favorito',
          body:  `A ${req.user!.name} le gustó "${meta.tripName ?? 'tu plan'}"`,
          url:   `/?share=${req.params.shareId}`,
        });
      }
    } catch (err) {
      logger.warn({ msg: 'notification insert failed', flowId: req.flowId, error: (err as Error).message });
    }
    next();
  };
}
