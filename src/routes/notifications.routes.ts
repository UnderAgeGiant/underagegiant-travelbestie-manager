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

// Limits below were widened twice (list/read 20->60->150, status 30->120->300,
// mute 10->30->90) after users were still hitting 429s on GET /notifications/status
// during completely regular use (a single AI-planning session with a couple of tabs
// open). Frontend polls /status once every 60s per tab (NotificationService.
// POLL_INTERVAL_MS), so 300/60s gives headroom for 5 simultaneous tabs/devices with
// margin to spare — normal use should never legitimately 429 at this level.
export function createNotificationsRouter(notificationRepo: INotificationRepository): Router {
  const router = Router();

  // Limits below were widened once already (list/read 20->60, status 30->120,
  // mute 10->30) on the theory that the realistic 429 pressure is multi-tab/
  // multi-device polling, not single-session volume — see manager CLAUDE.md's
  // "AI Plan Timeout Resilience & History" section. Users were still hitting
  // 429s on /status during completely regular use (a single AI-planning
  // session with a couple of tabs open), so headroom is widened further here:
  // status 120->300, list/read 60->150, mute 30->90. Each poller only calls
  // /status once every 60s (NotificationService.POLL_INTERVAL_MS, frontend),
  // so even 5 simultaneous tabs/devices per user (300/60s ÷ 60s-interval =
  // room for 5 pollers with margin to spare) should never legitimately 429.
  router.get('/',
    requireAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:notif-list', windowSeconds: 60, maxRequests: 150, getKey: byUser }),
    makeListNotifications(notificationRepo),
    respond(200),
  );

  router.get('/status',
    requireAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:notif-status', windowSeconds: 60, maxRequests: 300, getKey: byUser }),
    makeNotificationStatus(notificationRepo),
    respond(200),
  );

  router.post('/read',
    requireAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:notif-read', windowSeconds: 60, maxRequests: 150, getKey: byUser }),
    makeMarkAllRead(notificationRepo),
    respond(204),
  );

  router.put('/mute',
    requireAuth,
    rateLimitMiddleware({ keyPrefix: 'rl:notif-mute', windowSeconds: 60, maxRequests: 90, getKey: byUser }),
    validateBody(muteSchema),
    makeSetMute(notificationRepo),
    respond(200),
  );

  return router;
}
