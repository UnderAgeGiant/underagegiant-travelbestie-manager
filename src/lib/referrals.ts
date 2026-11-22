import { randomInt } from 'crypto';
import { IReferralRepository } from '../repositories/interfaces/referral.repository';
import { INotificationRepository } from '../repositories/interfaces/notification.repository';
import { logger } from './logger';
import { capture } from './analytics';

/** F81 (contracts §19): Tokens paid to the referrer per referred account, and per Santiago month at most. */
export const REFERRAL_REWARD = 10;
export const REFERRAL_MONTHLY_CAP = 100;
export const REFERRAL_CODE_RE = /^[a-z0-9]{8}$/;

const CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Random 8-char invite code, never derived from the user's email or username. */
export function generateReferralCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-12-01' → 'diciembre' (the referral_cap notification copy). */
export function spanishMonthName(isoDate: string): string {
  return MONTHS[Number(isoDate.slice(5, 7)) - 1];
}

/**
 * F81 (contracts §19.5): settles the referred user's referral once their first plan is saved, then tells the
 * referrer. Never throws: a settlement error is logged (logger.error → server_error) so the owner can pay by hand,
 * and the notification / analytics steps are non-fatal.
 */
export async function settleReferral(
  deps: { referrals: IReferralRepository; notifications: INotificationRepository },
  referredUserId: string,
  flowId?: string,
): Promise<void> {
  let settled;
  try {
    settled = await deps.referrals.settle(referredUserId);
  } catch (err) {
    logger.error({ msg: 'referral settlement failed', referredUserId, flowId, err });
    return;
  }
  if (!settled) return;
  const { referrerUserId, outcome, capResetsOn } = settled;

  const copy = {
    paid:         { type: 'referral_reward',       title: `+${REFERRAL_REWARD} Tokens por tu invitación 🎉`, body: 'Una persona que invitaste creó su primer plan.' },
    cap:          { type: 'referral_cap',          title: 'Llegaste al máximo del mes', body: `Una persona que invitaste creó su primer plan, pero ya sumaste ${REFERRAL_MONTHLY_CAP} Tokens este mes. Vuelves a sumar el 1 de ${spanishMonthName(capResetsOn)}.` },
    same_browser: { type: 'referral_same_browser', title: 'Invitación sin Tokens', body: 'Esta cuenta se creó desde tu mismo navegador, así que no suma Tokens. Cuenta igual como persona invitada.' },
  } as const;
  try {
    await deps.notifications.add({ userId: referrerUserId, ...copy[outcome], url: '/preferences' });
  } catch (err) {
    logger.warn({ msg: 'Failed to notify the referrer', referrerUserId, outcome, err });
  }
  try {
    if (outcome === 'paid') capture(referrerUserId, 'cta_referral_rewarded', {});
    else capture(referrerUserId, 'cta_referral_skipped', { reason: outcome });
  } catch (err) {
    logger.warn({ msg: 'Failed to capture the referral outcome', referrerUserId, outcome, err });
  }
}
