import { Request, Response, NextFunction } from 'express';
import { generateOtpCode, storeOtpFor } from '../../lib/otp';
import { sendOtpEmail } from '../../lib/email';
import { logger } from '../../lib/logger';

const GENERIC_MESSAGE = 'Si el correo está registrado, te enviamos un código para restablecer tu contraseña.';

export async function generateResetOtpMiddleware(
  req: Request, _res: Response, next: NextFunction,
): Promise<void> {
  req.result = { message: GENERIC_MESSAGE };

  // No user → behave identically (no enumeration), but skip emailing.
  if (!req.foundUser) {
    logger.info({ msg: 'Password reset requested for unknown email (no-op)', flowId: req.flowId });
    next();
    return;
  }

  const email = req.foundUser.email.toLowerCase();
  const code = generateOtpCode();
  try {
    await storeOtpFor('reset', email, code);
    await sendOtpEmail(email, code);
    logger.info({ msg: 'Password reset OTP generated and sent', flowId: req.flowId, email });
  } catch (err) {
    // Do not surface the failure to the caller (still 200 with generic message) — just log.
    logger.error({ msg: 'Failed to send password reset OTP', flowId: req.flowId, email, err: String(err) });
  }
  next();
}
