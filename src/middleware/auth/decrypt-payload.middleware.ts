import { Request, Response, NextFunction } from 'express';
import { decryptPayload } from '../../lib/crypto';

// When RSA_PRIVATE_KEY is absent (local dev) accept plaintext body fields directly.
// In production the key must be set or the server won't start (enforced by Vercel secrets).
const RSA_KEY_CONFIGURED = Boolean(process.env.RSA_PRIVATE_KEY);

export function decryptPayloadMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!RSA_KEY_CONFIGURED) { next(); return; }
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
