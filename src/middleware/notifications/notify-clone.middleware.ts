import { Request, Response, NextFunction } from 'express';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';
import { logger } from '../../lib/logger';

/**
 * Store an in-app notification for the trip owner when someone clones their
 * shared trip. Skipped when the cloner is the owner. Non-fatal.
 */
export function makeNotifyClone(notificationRepo: INotificationRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const meta = req.sharedTripMeta;
      if (meta && req.user!.userId !== meta.ownerId) {
        await notificationRepo.add({
          userId: meta.ownerId,
          type:  'clone',
          title: '📋 Copiaron tu plan',
          body:  `${req.user!.name} clonó "${meta.tripName ?? 'tu plan'}" a sus viajes`,
          url:   `/?share=${req.params.shareId}`,
        });
      }
    } catch (err) {
      logger.warn({ msg: 'notification insert failed', flowId: req.flowId, error: (err as Error).message });
    }
    next();
  };
}
