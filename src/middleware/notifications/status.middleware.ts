import { Request, Response, NextFunction } from 'express';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';

/** Cheap payload the frontend polls every 60 s: unread count + mute flag. Redis-cached — see PgNotificationRepository.getStatus. */
export function makeNotificationStatus(notificationRepo: INotificationRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.result = await notificationRepo.getStatus(req.user!.userId);
      next();
    } catch (err) { next(err); }
  };
}
