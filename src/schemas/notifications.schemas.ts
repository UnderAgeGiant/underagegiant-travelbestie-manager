import { z } from 'zod';

export const muteSchema = z.object({
  muted: z.boolean(),
});
