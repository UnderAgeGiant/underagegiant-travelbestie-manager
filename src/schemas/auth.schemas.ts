import { z } from 'zod';
import { placeSchema } from './trip.schemas';
import { REFERRAL_CODE_RE } from '../lib/referrals';

const email    = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(6).max(200);
const otp      = z.string().trim().regex(/^\d{6}$/, 'otp must be a 6-digit code');
const name     = z.string().trim().min(1).max(100);

export const requestOtpSchema = z.object({ email });

// F81 (contracts §1.2): a malformed code or channel is dropped, never a 400 — the registration must not fail over it.
export const registerSchema = z.object({
  name, email, password, otp,
  referralCode:    z.string().regex(REFERRAL_CODE_RE).optional().catch(undefined),
  referralChannel: z.enum(['link', 'shared_plan', 'card']).optional().catch(undefined),
});

export const loginSchema = z.object({ email, password: z.string().min(1).max(200) });

export const requestProfileOtpSchema = z.object({ newEmail: email });

export const requestPasswordResetSchema = z.object({ email });

export const resetPasswordSchema = z.object({ email, otp, newPassword: password });

// Profile update: every field optional, but at least one must be present.
export const profileSchema = z.object({
  name:            name.optional(),
  newEmail:        email.optional(),
  otp:             otp.optional(),
  currentPassword: z.string().min(1).max(200).optional(),
  newPassword:     password.optional(),
  countryOfResidence: z.string().trim().regex(/^[A-Z]{2}$/, 'countryOfResidence must be a 2-letter ISO country code').nullable().optional(),
  homePlace:       placeSchema.nullable().optional(),
  username:        z.string().trim().toLowerCase().max(50).optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'at least one field is required' });
