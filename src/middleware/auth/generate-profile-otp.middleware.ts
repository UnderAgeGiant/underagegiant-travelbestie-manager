import { Request, Response, NextFunction } from 'express';
import { generateOtpCode, storeProfileOtp } from '../../lib/otp';
import { sendOtpEmail } from '../../lib/email';
import { logger } from '../../lib/logger';

export async function generateProfileOtpMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  const newEmail = (req.body.newEmail as string).toLowerCase();
  const code = generateOtpCode();
  try {
    await storeProfileOtp(newEmail, code);
    await sendOtpEmail(newEmail, code);
    logger.info({ msg: 'Profile OTP generated and sent', flowId: req.flowId, newEmail });
    req.result = { message: 'Código de verificación enviado a la nueva dirección de correo.' };
    next();
  } catch (err) {
    logger.error({ msg: 'Failed to generate profile OTP', flowId: req.flowId, newEmail, err });
    res.status(500).json({ error: 'No se pudo enviar el código de verificación. Intenta de nuevo.' });
  }
}
