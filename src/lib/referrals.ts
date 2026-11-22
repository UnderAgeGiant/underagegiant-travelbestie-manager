import { randomInt } from 'crypto';

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
