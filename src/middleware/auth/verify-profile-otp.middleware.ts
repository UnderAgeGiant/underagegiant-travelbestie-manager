import { Request, Response, NextFunction } from 'express';
import { getStoredOtpCodeFor, generateOtpCode, storeOtpFor, deleteOtpFor } from '../../lib/otp';
import { sendOtpEmail } from '../../lib/email';
import { logger } from '../../lib/logger';

export async function verifyProfileOtpMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  if (!req.body.newEmail) { next(); return; }

  const newEmail = (req.body.newEmail as string).toLowerCase();
  const otp = req.body.otp !== undefined ? String(req.body.otp).trim() : undefined;

  if (!otp) {
    res.status(400).json({ error: 'Se requiere el código de verificación para cambiar el correo.' });
    return;
  }

  try {
    const storedCode = await getStoredOtpCodeFor('profile', newEmail);
    if (!storedCode) {
      res.status(400).json({ error: 'Código expirado o no solicitado. Solicita un nuevo código.' });
      return;
    }
    if (storedCode !== otp) {
      const newCode = generateOtpCode();
      await storeOtpFor('profile', newEmail, newCode);
      await sendOtpEmail(newEmail, newCode);
      logger.info({ msg: 'Profile OTP mismatch — renewed and sent', flowId: req.flowId, newEmail });
      res.status(400).json({ error: 'Código incorrecto. Se ha enviado un nuevo código a tu correo.' });
      return;
    }
    await deleteOtpFor('profile', newEmail);
    next();
  } catch (err) {
    logger.error({ msg: 'Profile OTP verification error', flowId: req.flowId, newEmail, err });
    res.status(500).json({ error: 'Error al verificar el código. Intenta de nuevo.' });
  }
}
