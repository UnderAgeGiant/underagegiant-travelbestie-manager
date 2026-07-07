import { Request, Response, NextFunction } from 'express';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';

export function makeSetMute(notificationRepo: INotificationRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const muted = req.body.muted as boolean;
      await notificationRepo.setMuted(req.user!.userId, muted);
      req.result = { muted };
      next();
    } catch (err) { next(err); }
  };
}
