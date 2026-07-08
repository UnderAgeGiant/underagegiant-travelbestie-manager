import { NotificationRecord, NotificationType } from '../../types';

/** Rows kept per user — older rows are pruned on insert. */
export const NOTIFICATIONS_MAX_STORED = 50;
/** Rows returned by listByUser. */
export const NOTIFICATIONS_LIST_LIMIT = 30;

export interface INotificationRepository {
  /** Insert a notification — no-op when the user has notifications muted. Prunes to NOTIFICATIONS_MAX_STORED. */
  add(data: { userId: string; type: NotificationType; title: string; body: string; url: string }): Promise<void>;

  /** Newest first, LIMIT NOTIFICATIONS_LIST_LIMIT. */
  listByUser(userId: string): Promise<NotificationRecord[]>;

  countUnread(userId: string): Promise<number>;

  /** Cached facade over countUnread + isMuted — the poll target for GET /notifications/status. */
  getStatus(userId: string): Promise<{ count: number; muted: boolean }>;

  /** Mark every notification of the user as read. Idempotent. */
  markAllRead(userId: string): Promise<void>;

  isMuted(userId: string): Promise<boolean>;

  setMuted(userId: string, muted: boolean): Promise<void>;
}
