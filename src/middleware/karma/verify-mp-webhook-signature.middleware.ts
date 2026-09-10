import { Request, Response, NextFunction } from 'express';
import { verifyMpWebhookSignature } from '../../lib/mercadopago';
import { respondError } from '../../lib/respond-error';

export function verifyMpWebhookSignatureMiddleware(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as { data?: { id?: string } };
  const dataId =
    body.data?.id ??
    (req.query['data.id'] as string | undefined) ??
    (req.query['id'] as string | undefined);
  const xSignature = req.header('x-signature');
  const xRequestId = req.header('x-request-id');

  if (!dataId || !verifyMpWebhookSignature(xSignature, xRequestId, dataId)) {
    respondError(req, res, 401, { error: 'Invalid webhook signature' });
    return;
  }
  next();
}
