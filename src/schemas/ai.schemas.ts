import { z } from 'zod';

export const aiSuggestSchema = z.object({
  preferences: z.string().trim().min(1).max(2000),
  duration:    z.number().int().min(1).max(60).optional(),
  budget:      z.string().max(100).optional(),
  cityIndex:   z.array(z.object({
    id:   z.string().min(1).max(80),
    name: z.string().min(1).max(120),
  }).passthrough()).max(1000).optional(),
}).passthrough();

export const aiPlanSchema = z.object({
  preferences:    z.string().trim().min(1).max(2000),
  selectedOption: z.object({
    id:         z.number(),
    title:      z.string().max(300),
    summary:    z.string().max(3000),
    highlights: z.array(z.string().max(300)).max(50),
    cityIds:    z.array(z.string().min(1).max(80)).max(20).optional(),
  }).passthrough(),
  duration:      z.number().int().min(1).max(60).optional(),
  budget:        z.string().max(100).optional(),
  startDate:     z.string().max(10).optional(),
  planSessionId: z.string().max(200).optional(),
  cityCatalog:   z.record(z.string(), z.array(z.object({ id: z.string(), name: z.string() }).passthrough())).optional(),
}).passthrough();

export const aiSuggestAttractionsSchema = z.object({
  cityId:                z.string().min(1).max(80),
  checkIn:                z.string().min(1).max(10),
  checkOut:               z.string().min(1).max(10),
  existingAttractionIds:  z.array(z.string().min(1).max(120)).max(100).optional(),
  cityCatalog:            z.array(z.object({ id: z.string(), name: z.string() }).passthrough()).max(300),
  isFollowUp:             z.boolean().optional(),
}).passthrough();

export type AiSuggestBody             = z.infer<typeof aiSuggestSchema>;
export type AiPlanBody                = z.infer<typeof aiPlanSchema>;
export type AiSuggestAttractionsBody  = z.infer<typeof aiSuggestAttractionsSchema>;
