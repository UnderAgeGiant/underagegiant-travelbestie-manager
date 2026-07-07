import { Request, Response, NextFunction } from 'express';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';

export function makeMarkAllRead(notificationRepo: INotificationRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await notificationRepo.markAllRead(req.user!.userId);
      next();
    } catch (err) { next(err); }
  };
}
