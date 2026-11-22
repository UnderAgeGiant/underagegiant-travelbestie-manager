import { ReferralChannel, ReferralOutcome } from '../../types';

/** F81 referral codes, attribution and settlement (contracts §19). */
export interface IReferralRepository {
  /** The user's invite code, created on first call (random, retried on a unique collision). */
  getOrCreateCode(userId: string): Promise<string>;

  /** Public handle of a code's owner for the sign-up line; null when no user has that code. */
  findInviter(code: string): Promise<{ username: string | null; firstName: string } | null>;

  /** Upserts (user, X-Anonymous-Id); read only by the same-browser check in attach(). */
  recordAnonymousId(userId: string, anonymousId: string): Promise<void>;

  /** Writes the referred user's one referrals row when `code` belongs to another user. null = nothing inserted. */
  attach(referredUserId: string, code: string, channel: ReferralChannel, anonymousId: string | null): Promise<{ sameBrowser: boolean } | null>;

  /** Settles the row exactly once (locked): paid / cap / same_browser. null = no row, already settled, or referrer gone. */
  settle(referredUserId: string): Promise<{ referrerUserId: string; outcome: ReferralOutcome; capResetsOn: string } | null>;

  /** People invited (settled, any outcome) and Tokens paid this Santiago month. */
  summary(userId: string): Promise<{ invitedCount: number; monthTokens: number; capResetsOn: string }>;
}
