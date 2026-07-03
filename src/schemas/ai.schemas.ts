import { z } from 'zod';

export const aiSuggestSchema = z.object({
  preferences: z.string().trim().min(1).max(2000),
  duration:    z.number().int().min(1).max(60).optional(),
  budget:      z.string().max(100).optional(),
}).passthrough();

export const aiPlanSchema = z.object({
  preferences:    z.string().trim().min(1).max(2000),
  selectedOption: z.object({
    id:         z.number(),
    title:      z.string().max(300),
    summary:    z.string().max(3000),
    highlights: z.array(z.string().max(300)).max(50),
  }).passthrough(),
  duration:      z.number().int().min(1).max(60).optional(),
  budget:        z.string().max(100).optional(),
  startDate:     z.string().max(10).optional(),
  planSessionId: z.string().max(200).optional(),
  cityCatalog:   z.record(z.string(), z.array(z.object({ id: z.string(), name: z.string() }).passthrough())).optional(),
}).passthrough();

export type AiSuggestBody = z.infer<typeof aiSuggestSchema>;
export type AiPlanBody    = z.infer<typeof aiPlanSchema>;
