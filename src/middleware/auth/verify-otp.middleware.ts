import { Request, Response, NextFunction } from 'express';
import { getStoredOtpCode, generateOtpCode, storeOtp, deleteOtp } from '../../lib/otp';
import { sendOtpEmail } from '../../lib/email';
import { logger } from '../../lib/logger';

export async function verifyOtpMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const email = (req.body.email as string).toLowerCase();
  const otp   = req.body.otp as string;

  try {
    const storedCode = await getStoredOtpCode(email);

    if (!storedCode) {
      res.status(400).json({ error: 'Código expirado o no solicitado. Por favor solicita un nuevo código.' });
      return;
    }

    if (storedCode !== otp) {
      // Auto-renew: discard the old code, generate and email a fresh one
      const newCode = generateOtpCode();
      await storeOtp(email, newCode);
      await sendOtpEmail(email, newCode);
      logger.info({ msg: 'OTP mismatch — renewed and sent', flowId: req.flowId, email });
      res.status(400).json({ error: 'Código incorrecto. Se ha enviado un nuevo código a tu email.' });
      return;
    }

    // Valid — consume the code (single use)
    await deleteOtp(email);
    next();
  } catch (err) {
    logger.error({ msg: 'OTP verification error', flowId: req.flowId, email, err });
    res.status(500).json({ error: 'Error al verificar el código. Intenta de nuevo.' });
  }
}
