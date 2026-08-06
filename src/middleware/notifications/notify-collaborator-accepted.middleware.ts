import { Request, Response, NextFunction } from 'express';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';
import { logger } from '../../lib/logger';

/** Notifies the trip owner once the invited user accepts. Non-fatal. */
export function makeNotifyCollaboratorAccepted(notificationRepo: INotificationRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await notificationRepo.add({
        userId: req.trip!.ownerId,
        type:  'collaborator_accepted',
        title: '✅ Invitación aceptada',
        body:  `${req.user!.name} aceptó colaborar en "${req.trip!.title}"`,
        url:   '/',
      });
    } catch (err) {
      logger.warn({ msg: 'notification insert failed', flowId: req.flowId, error: (err as Error).message });
    }
    next();
  };
}
