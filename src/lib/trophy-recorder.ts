import { ITrophyRepository } from '../repositories/interfaces/trophy.repository';
import { INotificationRepository } from '../repositories/interfaces/notification.repository';
import { EarnedTrophy, TrophyType } from '../types';
import { tiersReached, trophyLabel } from './trophies';
import { logger } from './logger';

/**
 * Single entry point for awarding trophies. Records one countable event,
 * recounts, inserts every tier just reached, and notifies per new tier.
 * Never throws — trophy bookkeeping must never break the action that triggered it.
 */
export class TrophyRecorder {
  constructor(
    private readonly repo: ITrophyRepository,
    private readonly notifications: INotificationRepository,
  ) {}

  async record(userId: string, type: TrophyType, refId: string, scopeId?: string): Promise<EarnedTrophy[]> {
    let earned: EarnedTrophy[];
    try {
      if (!(await this.repo.addEvent(userId, type, refId, scopeId))) {
        // ponytail: a transient failure between addEvent and awardTiers consumes the event; tiered types self-heal on the next event, single trophies are lost. Recount on duplicates if that ever matters.
        return [];
      }
      const count = await this.repo.countEvents(userId, type, scopeId);
      earned = await this.repo.awardTiers(userId, type, tiersReached(type, count));
    } catch (err) {
      logger.warn({ msg: 'trophy record failed', userId, type, error: (err as Error).message });
      return [];
    }
    for (const t of earned) {
      try {
        await this.notifications.add({
          userId, type: 'trophy', title: '🏆 ¡Nuevo trofeo!', body: trophyLabel(t.type, t.tier), url: '/profile#trofeos',
        });
      } catch (err) {
        logger.warn({ msg: 'trophy notification failed', userId, type, error: (err as Error).message });
      }
    }
    return earned;
  }

  /** true on error — callers use it to skip optional writes, so failing closed is the cheap side. */
  async has(userId: string, type: TrophyType): Promise<boolean> {
    try { return await this.repo.hasTrophy(userId, type); }
    catch { return true; }
  }
}
