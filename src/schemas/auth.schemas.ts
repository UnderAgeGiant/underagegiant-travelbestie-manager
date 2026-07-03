import { z } from 'zod';

const email    = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(6).max(200);
const otp      = z.string().trim().regex(/^\d{6}$/, 'otp must be a 6-digit code');
const name     = z.string().trim().min(1).max(100);

export const requestOtpSchema = z.object({ email });

export const registerSchema = z.object({ name, email, password, otp });

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
  homeCity:        z.string().trim().max(120).optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'at least one field is required' });
