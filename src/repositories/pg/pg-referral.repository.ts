import { Pool } from 'pg';
import { IReferralRepository } from '../interfaces/referral.repository';
import { ReferralChannel, ReferralOutcome } from '../../types';
import { generateReferralCode, REFERRAL_MONTHLY_CAP, REFERRAL_REWARD } from '../../lib/referrals';

const CODE_TRIES = 5;

// Start of the current calendar month in America/Santiago as a local timestamp; `AT TIME ZONE` again turns it back into a timestamptz.
const SANTIAGO_MONTH = `SELECT date_trunc('month', now() AT TIME ZONE 'America/Santiago') AS local_start`;
const PAID_THIS_MONTH = `(SELECT COUNT(*) FROM referrals
   WHERE referrer_user_id = $1 AND outcome = 'paid'
     AND settled_at >= m.local_start AT TIME ZONE 'America/Santiago')::int`;
const NEXT_MONTH = `to_char(m.local_start + interval '1 month', 'YYYY-MM-DD')`;

export class PgReferralRepository implements IReferralRepository {
  constructor(private readonly pool: Pool) {}

  async getOrCreateCode(userId: string): Promise<string> {
    const existing = await this.readCode(userId);
    if (existing) return existing;
    for (let i = 0; i < CODE_TRIES; i++) {
      try {
        const { rows: [row] } = await this.pool.query<{ referral_code: string }>(
          `UPDATE users SET referral_code = $2 WHERE user_id = $1 AND referral_code IS NULL RETURNING referral_code`,
          [userId, generateReferralCode()],
        );
        if (row) return row.referral_code;
        const raced = await this.readCode(userId);   // a concurrent call set it first
        if (raced) return raced;
        throw new Error('User not found');
      } catch (err) {
        if ((err as { code?: string }).code !== '23505') throw err;   // unique collision → try a new code
      }
    }
    throw new Error('Could not generate a unique referral code');
  }

  private async readCode(userId: string): Promise<string | null> {
    const { rows: [row] } = await this.pool.query<{ referral_code: string | null }>(
      `SELECT referral_code FROM users WHERE user_id = $1`, [userId],
    );
    return row?.referral_code ?? null;
  }

  async findInviter(code: string): Promise<{ username: string | null; firstName: string } | null> {
    const { rows: [row] } = await this.pool.query<{ username: string | null; name: string }>(
      `SELECT username, name FROM users WHERE referral_code = $1`, [code],
    );
    return row ? { username: row.username, firstName: row.name.trim().split(/\s+/)[0] } : null;
  }

  async recordAnonymousId(userId: string, anonymousId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_anonymous_ids (user_id, anonymous_id) VALUES ($1, $2)
       ON CONFLICT (user_id, anonymous_id) DO UPDATE SET last_seen_at = now()`,
      [userId, anonymousId],
    );
  }

  async attach(referredUserId: string, code: string, channel: ReferralChannel, anonymousId: string | null): Promise<{ sameBrowser: boolean } | null> {
    const { rows: [row] } = await this.pool.query<{ same_browser: boolean }>(
      `INSERT INTO referrals (referred_user_id, referrer_user_id, channel, same_browser)
       SELECT $1, u.user_id, $3,
              $4::uuid IS NOT NULL AND EXISTS (
                SELECT 1 FROM user_anonymous_ids a WHERE a.user_id = u.user_id AND a.anonymous_id = $4::uuid)
       FROM users u
       WHERE u.referral_code = $2 AND u.user_id <> $1
       ON CONFLICT DO NOTHING
       RETURNING same_browser`,
      [referredUserId, code, channel, anonymousId],
    );
    return row ? { sameBrowser: row.same_browser } : null;
  }

  async settle(referredUserId: string): Promise<{ referrerUserId: string; outcome: ReferralOutcome; capResetsOn: string } | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [ref] } = await client.query<{ referrer_user_id: string | null; same_browser: boolean }>(
        `SELECT referrer_user_id, same_browser FROM referrals
         WHERE referred_user_id = $1 AND outcome IS NULL FOR UPDATE`,
        [referredUserId],
      );
      if (!ref?.referrer_user_id) { await client.query('ROLLBACK'); return null; }
      const referrer = ref.referrer_user_id;

      // Serialises settlements for the same referrer, so two of them can't both read the count at 90.
      await client.query(`SELECT 1 FROM users WHERE user_id = $1 FOR UPDATE`, [referrer]);
      const { rows: [month] } = await client.query<{ paid: number; cap_resets_on: string }>(
        `WITH m AS (${SANTIAGO_MONTH}) SELECT ${PAID_THIS_MONTH} AS paid, ${NEXT_MONTH} AS cap_resets_on FROM m`,
        [referrer],
      );

      const outcome: ReferralOutcome = ref.same_browser ? 'same_browser'
        : (month.paid + 1) * REFERRAL_REWARD > REFERRAL_MONTHLY_CAP ? 'cap'
        : 'paid';
      if (outcome === 'paid') {
        await client.query(`UPDATE users SET karma = karma + $2 WHERE user_id = $1`, [referrer, REFERRAL_REWARD]);
        await client.query(
          `INSERT INTO karma_events (user_id, delta, reason, ref_id) VALUES ($1, $2, 'referral_reward', $3)`,
          [referrer, REFERRAL_REWARD, referredUserId],
        );
      }
      await client.query(
        `UPDATE referrals SET outcome = $2, settled_at = now() WHERE referred_user_id = $1`,
        [referredUserId, outcome],
      );
      await client.query('COMMIT');
      return { referrerUserId: referrer, outcome, capResetsOn: month.cap_resets_on };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async summary(userId: string): Promise<{ invitedCount: number; monthTokens: number; capResetsOn: string }> {
    const { rows: [row] } = await this.pool.query<{ invited: number; paid: number; cap_resets_on: string }>(
      `WITH m AS (${SANTIAGO_MONTH})
       SELECT (SELECT COUNT(*) FROM referrals WHERE referrer_user_id = $1 AND outcome IS NOT NULL)::int AS invited,
              ${PAID_THIS_MONTH} AS paid, ${NEXT_MONTH} AS cap_resets_on
       FROM m`,
      [userId],
    );
    return { invitedCount: row.invited, monthTokens: row.paid * REFERRAL_REWARD, capResetsOn: row.cap_resets_on };
  }
}
