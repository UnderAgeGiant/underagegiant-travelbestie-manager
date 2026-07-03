import { z } from 'zod';

// Loose-but-bounded shapes for nested trip data. The repository owns the exact
// domain conversion (dd/mm/yyyy etc.); here we only guard structure + bounds so a
// malformed or oversized payload is rejected before it reaches the DB transaction.
const plannedAttraction = z.object({
  attractionId: z.string().min(1).max(200),
  startTime: z.string().max(5).nullable().optional(),
  endTime:   z.string().max(5).nullable().optional(),
  date:      z.string().max(10).nullable().optional(),
  category:  z.enum(['poi', 'freetour', 'event_party', 'foodie']).optional(),
}).passthrough();

const tripStop = z.object({
  cityId:   z.string().min(1).max(120),
  checkIn:  z.string().max(10),
  checkOut: z.string().max(10),
  selectedAttractions: z.array(plannedAttraction).max(500),
  lodging: z.object({ name: z.string().max(200), url: z.string().max(2000) }).optional(),
}).passthrough();

const transitLeg = z.object({
  fromCityId: z.string().max(120),
  toCityId:   z.string().max(120),
  segments:   z.array(z.object({}).passthrough()).max(50),
  date:       z.string().max(10).optional(),
}).passthrough();

export const createTripSchema = z.object({
  title:    z.string().trim().min(1).max(200),
  stops:    z.array(tripStop).max(100),
  transits: z.array(transitLeg).max(100).optional(),
}).passthrough();

export const updateTripSchema = createTripSchema;
