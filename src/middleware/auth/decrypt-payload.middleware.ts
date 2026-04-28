import { Request, Response, NextFunction } from 'express';
import { decryptPayload } from '../../lib/crypto';

export function decryptPayloadMiddleware(req: Request, res: Response, next: NextFunction): void {
  const { encryptedPayload } = req.body as { encryptedPayload?: string };
  if (!encryptedPayload) { res.status(400).json({ error: 'encryptedPayload is required' }); return; }
  try {
    const plaintext = decryptPayload(encryptedPayload);
    Object.assign(req.body, plaintext);
    next();
  } catch {
    res.status(400).json({ error: 'Invalid encrypted payload' });
  }
}
