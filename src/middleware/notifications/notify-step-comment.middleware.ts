import { Request, Response, NextFunction } from 'express';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';
import { logger } from '../../lib/logger';

/**
 * Store an in-app notification for the trip owner after a step comment is
 * saved. Skips when the commenter is the owner. Non-fatal — never blocks
 * the response.
 */
export function makeNotifyStepComment(notificationRepo: INotificationRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ownerId } = req.sharedTripMeta!;
      if (req.user!.userId !== ownerId) {
        await notificationRepo.add({
          userId: ownerId,
          type:  'comment',
          title: '💬 Nuevo comentario en tu plan',
          body:  `${req.user!.name}: "${(req.body.text as string).slice(0, 120)}"`,
          url:   `/?share=${req.params.shareId}`,
        });
      }
    } catch (err) {
      logger.warn({ msg: 'notification insert failed', flowId: req.flowId, error: (err as Error).message });
    }
    next();
  };
}
