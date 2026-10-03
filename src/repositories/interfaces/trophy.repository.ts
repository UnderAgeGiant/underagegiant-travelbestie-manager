import { EarnedTrophy, TrophyTier, TrophyType } from '../../types';

export interface ITrophyRepository {
  /** Insert one countable event. false when (userId, type, refId) was already counted. */
  addEvent(userId: string, type: TrophyType, refId: string, scopeId?: string): Promise<boolean>;
  /** Event count for the type; restricted to scopeId when given. */
  countEvents(userId: string, type: TrophyType, scopeId?: string): Promise<number>;
  /** Insert tiers (ON CONFLICT DO NOTHING); returns only the rows actually inserted. */
  awardTiers(userId: string, type: TrophyType, tiers: TrophyTier[]): Promise<EarnedTrophy[]>;
  hasTrophy(userId: string, type: TrophyType): Promise<boolean>;
  /** Newest first. */
  listEarned(userId: string): Promise<EarnedTrophy[]>;
  /** Per-type progress; scoped types (favorites) report the max over scopes. */
  progress(userId: string): Promise<Partial<Record<TrophyType, number>>>;
  listEarnedSince(userId: string, type: TrophyType, sinceIso: string): Promise<EarnedTrophy[]>;
}
