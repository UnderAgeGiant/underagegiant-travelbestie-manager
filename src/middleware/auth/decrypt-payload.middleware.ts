import { Request, Response, NextFunction } from 'express';
import { decryptPayload } from '../../lib/crypto';

export function decryptPayloadMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!process.env.RSA_PRIVATE_KEY) { next(); return; }
  const { encryptedPayload } = req.body as { encryptedPayload?: string };
  if (!encryptedPayload) { res.status(400).json({ error: 'encryptedPayload is required' }); return; }
  try {
    Object.assign(req.body, decryptPayload(encryptedPayload));
    next();
  } catch (e) {
    console.error('Failed to decrypt payload', e);
    res.status(400).json({ error: 'Invalid encrypted payload' });
  }
}
