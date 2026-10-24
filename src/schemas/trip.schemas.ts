import { z } from 'zod';
import { isGoogleMapsUrl } from '../lib/maps-url';

// Loose-but-bounded shapes for nested trip data. The repository owns the exact
// domain conversion (dd/mm/yyyy etc.); here we only guard structure + bounds so a
// malformed or oversized payload is rejected before it reaches the DB transaction.
const plannedAttraction = z.object({
  attractionId: z.string().min(1).max(200).optional(),
  // Feature 71 — personal activity. Format-only check: the type list lives in the frontend.
  activityType: z.string().regex(/^[a-z_]{1,30}$/).optional(),
  title:        z.string().trim().min(1).max(80).optional(),
  mapsUrl:      z.string().max(500).refine(isGoogleMapsUrl, 'mapsUrl must be a Google Maps https link').nullable().optional(),
  isPrivate:    z.boolean().optional(),
  startTime: z.string().max(5).nullable().optional(),
  endTime:   z.string().max(5).nullable().optional(),
  date:      z.string().max(10).nullable().optional(),
  category:  z.enum(['poi', 'freetour', 'event_party', 'foodie']).optional(),
  ticketPurchased: z.boolean().optional(),
}).passthrough().superRefine((a, ctx) => {
  if (!!a.attractionId === !!a.activityType) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'exactly one of attractionId or activityType is required' });
  }
  if (a.activityType && !a.title) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['title'], message: 'title is required for a personal activity' });
  }
});

const tripStop = z.object({
  cityId:   z.string().min(1).max(120),
  checkIn:  z.string().max(10),
  checkOut: z.string().max(10),
  selectedAttractions: z.array(plannedAttraction).max(500),
  lodging: z.object({
    name: z.string().max(200),
    url: z.string().max(2000),
    address: z.string().max(500).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }).optional(),
}).passthrough();

const transitLeg = z.object({
  fromCityId: z.string().max(120),
  toCityId:   z.string().max(120),
  segments:   z.array(z.object({}).passthrough()).max(50),
  date:       z.string().max(10).optional(),
}).passthrough();

// Feature 74 — a saved place (origin airport/city, also users.home_place). Shape per contracts §18.
export const placeSchema = z.object({
  geonameId:   z.number().int().positive(),
  name:        z.string().trim().min(1).max(120),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  iata:        z.string().regex(/^[A-Z]{3}$/),
});

export const costSettingsSchema = z.object({
  origin:   placeSchema.nullable(),
  adults:   z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  infants:  z.number().int().min(0).max(20).default(0),   // 0–2 years; old clients omit it
  comfort:  z.enum(['budget', 'mid', 'luxury']),
});

export const createTripSchema = z.object({
  title:    z.string().trim().min(1).max(200),
  stops:    z.array(tripStop).max(100),
  transits: z.array(transitLeg).max(100).optional(),
  sourceAiPlanRequestId: z.string().min(1).max(120).optional(),
  sourcePlanSessionId: z.string().min(1).max(200).optional(),
  costSettings: costSettingsSchema.optional(),
  // Snapshots are written only by clones (server-side copy); a client may not supply one on POST.
  costEstimate: z.undefined().optional(),
}).passthrough();

// PUT validates only the cost settings it can write; the rest of the body keeps its existing (unvalidated) behaviour.
export const updateTripSchema = z.object({
  costSettings: costSettingsSchema.optional(),
}).passthrough();
