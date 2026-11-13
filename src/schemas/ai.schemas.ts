import { z } from 'zod';

// Real IDs (frontend data): lowercase letters, digits, '_' and '-' — e.g. "paris", "merida_mx",
// "paris_0", "ft_paris_0", "ev_amsterdam_487749554".
export const ID_PATTERN = /^[a-z0-9_-]+$/;
export const catalogIdSchema = z.string().min(1).max(120).regex(ID_PATTERN);
export const cityIdSchema    = z.string().min(1).max(80).regex(ID_PATTERN);
// Names are interpolated into the DeepSeek prompt: no tag or {placeholder} characters, no line breaks.
export const catalogNameSchema  = z.string().min(1).max(120).regex(/^[^<>{}\r\n]+$/);
// z.object (no .passthrough()) strips unknown keys.
export const catalogEntrySchema = z.object({ id: catalogIdSchema, name: catalogNameSchema });

// F79 cities mode: 1–10 ticked cities. Present → `preferences` is optional (interest chips text only).
const citiesModeIdsSchema = z.array(cityIdSchema).min(1).max(10);

/** `preferences` is required unless cities mode is on. */
function requirePreferencesUnlessCities(body: { preferences?: string; cityIds?: string[] }, ctx: z.RefinementCtx): void {
  if (!body.cityIds?.length && !body.preferences) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['preferences'], message: 'Required' });
  }
}

export const aiSuggestSchema = z.object({
  preferences: z.string().trim().min(1).max(2000).optional(),
  duration:    z.number().int().min(1).max(60).optional(),
  budget:      z.string().max(100).optional(),
  cityIndex:   z.array(z.object({ id: cityIdSchema, name: catalogNameSchema })).max(1000).optional(),
  cityIds:     citiesModeIdsSchema.optional(),
  planSessionId: z.string().min(1).max(200).optional(),
}).passthrough().superRefine((body, ctx) => {
  requirePreferencesUnlessCities(body, ctx);
  if (!body.cityIds) return;
  if (body.duration == null || body.duration < body.cityIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cities_exceed_days' });
  }
  const known = new Set((body.cityIndex ?? []).map(c => c.id));
  if (body.cityIds.some(id => !known.has(id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cityIds'], message: 'every city must be in cityIndex' });
  }
});

export const aiPlanSchema = z.object({
  preferences:    z.string().trim().min(1).max(2000).optional(),
  selectedOption: z.object({
    id:         z.number(),
    title:      z.string().max(300),
    summary:    z.string().max(3000),
    highlights: z.array(z.string().max(300)).max(50),
    cityIds:    z.array(cityIdSchema).max(20).optional(),
  }).passthrough(),
  duration:      z.number().int().min(1).max(60).optional(),
  budget:        z.string().max(100).optional(),
  startDate:     z.string().max(10).optional(),
  planSessionId: z.string().max(200).optional(),
  cityCatalog:   z.record(cityIdSchema, z.array(catalogEntrySchema).max(300)).refine(c => Object.keys(c).length <= 20, { message: 'cityCatalog may cover at most 20 cities' }).optional(),
  cityIds:       citiesModeIdsSchema.optional(),
}).passthrough().superRefine(requirePreferencesUnlessCities);

export const aiSuggestAttractionsSchema = z.object({
  cityId:                cityIdSchema,
  tripId:                z.string().uuid().optional(),
  checkIn:                z.string().min(1).max(10),
  checkOut:               z.string().min(1).max(10),
  existingAttractionIds:  z.array(catalogIdSchema).max(100).optional(),
  existingSchedule:       z.array(z.object({
    date:      z.string().min(1).max(10),
    startTime: z.string().min(1).max(5),
    endTime:   z.string().min(1).max(5),
  }).passthrough()).max(100).optional(),
  departureTimes:         z.array(z.object({
    date: z.string().min(1).max(10),
    time: z.string().min(1).max(5),
  }).passthrough()).max(20).optional(),
  cityCatalog:            z.array(catalogEntrySchema).max(300),
  isFollowUp:             z.boolean().optional(),
}).passthrough();

export const suggestCompanionSchema = z.object({
  cityId:                cityIdSchema,
  addedAttractionId:     catalogIdSchema,
  checkIn:                z.string().min(1).max(10),
  checkOut:               z.string().min(1).max(10),
  existingAttractionIds:  z.array(catalogIdSchema).max(100).optional(),
  existingSchedule:       z.array(z.object({
    date:      z.string().min(1).max(10),
    startTime: z.string().min(1).max(5),
    endTime:   z.string().min(1).max(5),
  }).passthrough()).max(100).optional(),
  departureTimes:         z.array(z.object({
    date: z.string().min(1).max(10),
    time: z.string().min(1).max(5),
  }).passthrough()).max(20).optional(),
  cityCatalog:            z.array(catalogEntrySchema).max(300),
}).passthrough();

export type AiSuggestBody             = z.infer<typeof aiSuggestSchema>;
export type AiPlanBody                = z.infer<typeof aiPlanSchema>;
export type AiSuggestAttractionsBody  = z.infer<typeof aiSuggestAttractionsSchema>;
export type SuggestCompanionBody      = z.infer<typeof suggestCompanionSchema>;
