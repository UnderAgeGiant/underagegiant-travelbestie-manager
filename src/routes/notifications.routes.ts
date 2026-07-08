import { Router, Request } from 'express';
import { INotificationRepository } from '../repositories/interfaces/notification.repository';
import { requireAuth } from '../middleware/auth/require-auth.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { validateBody } from '../middleware/validate-body.middleware';
import { muteSchema } from '../schemas/notifications.schemas';
import { makeListNotifications } from '../middleware/notifications/list.middleware';
import { makeNotificationStatus } from '../middleware/notifications/status.middleware';
import { makeMarkAllRead } from '../middleware/notifications/mark-read.middleware';
import { makeSetMute } from '../middleware/notifications/set-mute.middleware';
import { respond } from '../middleware/respond.middleware';

// Per-user key (limiters run after requireAuth). IP keying would 429 users
// behind shared NAT whose combined polling exceeds the limit.
const byUser = (req: Request): string => req.user?.userId ?? req.ip ?? 'unknown';

export function createNotificationsRouter(notificationRepo: INotificationRepository): Router {
  const router = Router();

  router.get('/',
    requireAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:notif-list', windowSeconds: 60, maxRequests: 20, getKey: byUser }),
    makeListNotifications(notificationRepo),
    respond(200),
  );

  router.get('/status',
    requireAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:notif-status', windowSeconds: 60, maxRequests: 30, getKey: byUser }),
    makeNotificationStatus(notificationRepo),
    respond(200),
  );

  router.post('/read',
    requireAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:notif-read', windowSeconds: 60, maxRequests: 20, getKey: byUser }),
    makeMarkAllRead(notificationRepo),
    respond(204),
  );

  router.put('/mute',
    requireAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:notif-mute', windowSeconds: 60, maxRequests: 10, getKey: byUser }),
    validateBody(muteSchema),
    makeSetMute(notificationRepo),
    respond(200),
  );

  return router;
}
