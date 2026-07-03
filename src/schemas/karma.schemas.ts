import { z } from 'zod';

export const createOrderSchema  = z.object({ packageId: z.string().min(1).max(100) });
export const captureOrderSchema = z.object({ orderID:   z.string().min(1).max(200) });

export type CreateOrderBody = z.infer<typeof createOrderSchema>;
