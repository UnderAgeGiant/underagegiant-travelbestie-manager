import { Request, Response, NextFunction } from 'express';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';

export function makeListNotifications(notificationRepo: INotificationRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.result = { notifications: await notificationRepo.listByUser(req.user!.userId) };
      next();
    } catch (err) { next(err); }
  };
}
