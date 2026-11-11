import { z } from 'zod';

// POST /trips/:id/itinerary body (F78, contract §2.5). Every field optional so an
// older frontend (legacy 3-map body, or {}) keeps working.

function isHttpUrl(s: string): boolean {
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    return !!new URL(s).hostname;
  } catch {
    return false;
  }
}

const str = (max = 200) => z.string().max(max);
const url = z.string().max(500).refine(isHttpUrl, 'must be an http(s) URL');
const hm = z.string().regex(/^\d{2}:\d{2}$/);

/** Record with bounded keys and a bounded entry count. */
function record<T extends z.ZodTypeAny>(value: T, maxEntries: number) {
  return z.record(z.string().max(100), value)
    .refine(r => Object.keys(r).length <= maxEntries, `at most ${maxEntries} entries`);
}

// The legacy maps carry the whole city catalog from an older frontend (≤ ~75 per city).
const LEGACY_MAX = 2000;
const NEW_MAX = 400;

const daySchedule = z.object({ open: hm, close: hm });

const attractionDetail = z.object({
  nativeName: str().optional(),
  type: str().optional(),
  rating: z.number().min(0).max(5).optional(),
  schedule: z.object({
    mon: daySchedule.optional(), tue: daySchedule.optional(), wed: daySchedule.optional(),
    thu: daySchedule.optional(), fri: daySchedule.optional(), sat: daySchedule.optional(), sun: daySchedule.optional(),
  }).optional(),
  website: url.optional(),
  ticketUrl: url.optional(),
  description: str(1000).optional(),
});

const destinationFacts = z.object({
  country: str(),
  flag: str().optional(),
  visa: str(300).optional(),
  currency: str(300).optional(),
  plug: str(300).optional(),
  cities: z.array(z.object({ name: str(), timeDiff: str().optional() })).max(60),
});

export const itineraryExportSchema = z.object({
  locale: z.enum(['es-CL', 'en-US']).optional(),
  cityNames: record(str(), NEW_MAX).optional(),
  attractionNames: record(str(), LEGACY_MAX).optional(),
  ticketRequiredIds: z.array(str(100)).max(LEGACY_MAX).optional(),
  attractionDurations: record(z.number().int().min(0).max(1440), LEGACY_MAX).optional(),
  attractionDetails: record(attractionDetail, NEW_MAX).optional(),
  personalLabels: record(str(), NEW_MAX).optional(),
  destinations: z.array(destinationFacts).max(30).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  siteUrl: z.string().max(200).refine(isHttpUrl, 'must be an http(s) URL').optional(),
});

export type ItineraryExportBody = z.infer<typeof itineraryExportSchema>;
export type AttractionDetail = z.infer<typeof attractionDetail>;
export type DestinationFacts = z.infer<typeof destinationFacts>;
