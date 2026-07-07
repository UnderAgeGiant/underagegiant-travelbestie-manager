import { Pool } from 'pg';
import {
  INotificationRepository, NOTIFICATIONS_MAX_STORED, NOTIFICATIONS_LIST_LIMIT,
} from '../interfaces/notification.repository';
import { NotificationRecord, NotificationType } from '../../types';

export class PgNotificationRepository implements INotificationRepository {
  constructor(private readonly pool: Pool) {}

  async add(data: { userId: string; type: NotificationType; title: string; body: string; url: string }): Promise<void> {
    // INSERT … SELECT so the mute check and the insert are a single statement.
    const { rowCount } = await this.pool.query(
      `INSERT INTO notifications (user_id, type, title, body, url)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT (SELECT notifications_muted FROM users WHERE user_id = $1)`,
      [data.userId, data.type, data.title, data.body, data.url],
    );
    if (rowCount) {
      await this.pool.query(
        `DELETE FROM notifications
         WHERE user_id = $1
           AND notification_id NOT IN (
             SELECT notification_id FROM notifications
             WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2)`,
        [data.userId, NOTIFICATIONS_MAX_STORED],
      );
    }
  }

  async listByUser(userId: string): Promise<NotificationRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT notification_id AS "notificationId", user_id AS "userId",
              type, title, body, url, read, created_at AS "createdAt"
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, NOTIFICATIONS_LIST_LIMIT],
    );
    return rows.map(r => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));
  }

  async countUnread(userId: string): Promise<number> {
    const { rows: [row] } = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND NOT read`,
      [userId],
    );
    return row.count as number;
  }

  async markAllRead(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE notifications SET read = TRUE WHERE user_id = $1 AND NOT read`,
      [userId],
    );
  }

  async isMuted(userId: string): Promise<boolean> {
    const { rows: [row] } = await this.pool.query(
      `SELECT notifications_muted AS muted FROM users WHERE user_id = $1`,
      [userId],
    );
    return (row?.muted as boolean) ?? false;
  }

  async setMuted(userId: string, muted: boolean): Promise<void> {
    await this.pool.query(
      `UPDATE users SET notifications_muted = $2 WHERE user_id = $1`,
      [userId, muted],
    );
  }
}
