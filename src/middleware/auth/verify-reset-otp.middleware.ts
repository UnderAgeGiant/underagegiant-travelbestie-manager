import { Request, Response, NextFunction } from 'express';
import { getStoredResetOtpCode, generateOtpCode, storeResetOtp, deleteResetOtp } from '../../lib/otp';
import { registerFailedAttempt, clearAttempts } from '../../lib/otp-attempts';
import { sendOtpEmail } from '../../lib/email';
import { logger } from '../../lib/logger';

export async function verifyResetOtpMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  const email = (req.body.email as string).toLowerCase();
  const otp = req.body.otp !== undefined ? String(req.body.otp).trim() : undefined;

  if (!otp) {
    res.status(400).json({ error: 'Se requiere el código de verificación para restablecer la contraseña.' });
    return;
  }

  try {
    const storedCode = await getStoredResetOtpCode(email);
    if (!storedCode) {
      res.status(400).json({ error: 'Código expirado o no solicitado. Solicita un nuevo código.' });
      return;
    }
    if (storedCode !== otp) {
      const locked = await registerFailedAttempt('reset', email);
      if (locked) {
        logger.warn({ msg: 'Password reset OTP attempt limit reached', flowId: req.flowId, email });
        res.status(429).json({ error: 'Demasiados intentos. Solicita un nuevo código más tarde.' });
        return;
      }
      const newCode = generateOtpCode();
      await storeResetOtp(email, newCode);
      await sendOtpEmail(email, newCode);
      logger.info({ msg: 'Password reset OTP mismatch — renewed and sent', flowId: req.flowId, email });
      res.status(400).json({ error: 'Código incorrecto. Se ha enviado un nuevo código a tu correo.' });
      return;
    }
    await deleteResetOtp(email);
    await clearAttempts('reset', email);
    next();
  } catch (err) {
    logger.error({ msg: 'Password reset OTP verification error', flowId: req.flowId, email, err: String(err) });
    res.status(500).json({ error: 'Error al verificar el código. Intenta de nuevo.' });
  }
}
