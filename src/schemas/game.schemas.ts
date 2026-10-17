import { z } from 'zod';

const count = z.number().int().nonnegative().max(100_000_000);
export const finishRunSchema = z.object({ score: count, durationMs: count, obstacles: count });
