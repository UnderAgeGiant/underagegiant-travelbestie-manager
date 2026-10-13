import { Request, Response, NextFunction, RequestHandler } from 'express';
import { IFollowRepository } from '../../repositories/interfaces/follow.repository';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';
import { logger } from '../../lib/logger';

/** Once per (follower, followee) pair, ever. Needs req.foundUser (the follower). Never fails the follow. */
export function makeNotifyNewFollower(follows: IFollowRepository, notifications: INotificationRepository): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const follower = req.foundUser!;
      const followee = req.targetUser!;
      if (await follows.markNotified(follower.id, followee.id)) {
        await notifications.add({
          userId: followee.id,
          type:   'new_follower',
          title:  '👥 Nuevo seguidor',
          body:   `${follower.name} te empezó a seguir`,
          url:    follower.username ? `/u/${follower.username}` : '',
        });
      }
    } catch (err) {
      logger.warn({ msg: 'new_follower notification failed', flowId: req.flowId, error: (err as Error).message });
    }
    next();
  };
}
