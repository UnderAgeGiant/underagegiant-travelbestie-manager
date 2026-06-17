import { Request, Response } from 'express';
import { logger } from './logger';

export function respondError(req: Request, res: Response, status: number, body: Record<string, unknown>): void {
  logger.warn({
    flowId: req.flowId,
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.userId ?? null,
    status,
    msg: (body.error as string | undefined) ?? 'request rejected',
  });
  res.status(status).json(body);
}
