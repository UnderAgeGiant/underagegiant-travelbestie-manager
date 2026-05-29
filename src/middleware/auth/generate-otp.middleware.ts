import { Request, Response, NextFunction } from 'express';
import { generateOtpCode, storeOtp } from '../../lib/otp';
import { sendOtpEmail } from '../../lib/email';
import { logger } from '../../lib/logger';

export async function generateOtpMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const email = (req.body.email as string).toLowerCase();
  const code = generateOtpCode();
  try {
    await storeOtp(email, code);
    await sendOtpEmail(email, code);
    logger.info({ msg: 'OTP generated and sent', flowId: req.flowId, email });
    req.result = { message: 'Código de verificación enviado. Revisa tu email.' };
    next();
  } catch (err) {
    logger.error({ msg: 'Failed to generate/send OTP', flowId: req.flowId, email, err });
    res.status(500).json({ error: 'No se pudo enviar el código de verificación. Intenta de nuevo.' });
  }
}
