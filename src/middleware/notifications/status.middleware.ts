import { Request, Response, NextFunction } from 'express';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';

/** Cheap payload the frontend polls every 60 s: unread count + mute flag. */
export function makeNotificationStatus(notificationRepo: INotificationRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const [count, muted] = await Promise.all([
        notificationRepo.countUnread(userId),
        notificationRepo.isMuted(userId),
      ]);
      req.result = { count, muted };
      next();
    } catch (err) { next(err); }
  };
}
