import { Request, Response, NextFunction } from 'express';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';
import { logger } from '../../lib/logger';

/** Notifies the invitee right after a pending trip_collaborators row is inserted. Non-fatal. */
export function makeNotifyCollaboratorInvite(notificationRepo: INotificationRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await notificationRepo.add({
        userId: req.invitedUser!.id,
        type:  'collaborator_invite',
        title: '🤝 Te invitaron a colaborar',
        body:  `${req.user!.name} te invitó a colaborar en "${req.trip!.title}"`,
        url:   '/',
      });
    } catch (err) {
      logger.warn({ msg: 'notification insert failed', flowId: req.flowId, error: (err as Error).message });
    }
    next();
  };
}
