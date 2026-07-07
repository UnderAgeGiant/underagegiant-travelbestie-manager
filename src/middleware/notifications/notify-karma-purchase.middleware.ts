import { Request, Response, NextFunction } from 'express';
import { INotificationRepository } from '../../repositories/interfaces/notification.repository';
import { logger } from '../../lib/logger';

/**
 * Store a purchase-confirmation notification for the buyer after a successful
 * capture. Guarded by providerCaptureId, like the confirmation email.
 * Non-fatal — never blocks the response.
 */
export function makeNotifyKarmaPurchase(notificationRepo: INotificationRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const purchase = req.karmaPurchase;
      if (purchase?.providerCaptureId && req.user) {
        const balance = (req.result as { karma?: number } | undefined)?.karma;
        await notificationRepo.add({
          userId: req.user.userId,
          type:  'purchase',
          title: '✅ Compra confirmada',
          body:  `+${purchase.karmaAmount} karma acreditado${balance !== undefined ? ` · saldo: ${balance}` : ''}`,
          url:   '/',
        });
      }
    } catch (err) {
      logger.warn({ msg: 'notification insert failed', flowId: req.flowId, error: (err as Error).message });
    }
    next();
  };
}
