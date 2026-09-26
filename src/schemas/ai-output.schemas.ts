import { z } from 'zod';
import { ID_PATTERN } from './ai.schemas';

const DATE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;   // dd/mm/yyyy (model sometimes drops a leading zero)
const TIME = /^\d{1,2}:\d{2}$/;             // HH:mm
const HTTPS_URL = /^https:\/\/\S+$/;

const idString = z.string().max(120).regex(ID_PATTERN);

// Model-output schemas. z.object() strips unknown keys; .catch() replaces an invalid
// value instead of failing the whole response.
export const suggestOutputSchema = z.object({
  options: z.array(z.object({
    id:         z.number().int(),
    title:      z.string().min(1).max(150),
    summary:    z.string().min(1).max(1000),
    highlights: z.array(z.string().max(150)).max(10),
    cityIds:    z.array(z.string().max(120)).max(20).optional(),
  })).length(2),
});

const plannedAttractionOutputSchema = z.object({
  attractionId: z.string().max(120),
  date:         z.string().regex(DATE).optional(),
  startTime:    z.string().regex(TIME).nullable().optional(),
  endTime:      z.string().regex(TIME).nullable().optional(),
});

const lodgingOutputSchema = z.object({
  name:    z.string().max(200),
  url:     z.string().max(500).regex(HTTPS_URL).catch(''),
  address: z.string().max(300).optional(),
  notes:   z.string().max(500).optional(),
});

const segmentOutputSchema = z.object({
  mode:            z.enum(['flight', 'train', 'boat', 'bus', 'car']),
  departureDate:   z.string().regex(DATE),
  departureTime:   z.string().regex(TIME),
  arrivalDate:     z.string().regex(DATE),
  arrivalTime:     z.string().regex(TIME),
  notes:           z.string().max(500).catch(''),
  durationMinutes: z.number().int().min(0).max(10080).optional(),
  carrier:         z.string().max(100).optional(),
  locationUrl:     z.string().max(500).regex(HTTPS_URL).optional().catch(undefined),
});

export const planOutputSchema = z.object({
  title: z.string().min(1).max(150),
  stops: z.array(z.object({
    cityId:              idString,
    checkIn:             z.string().regex(DATE),
    checkOut:            z.string().regex(DATE),
    selectedAttractions: z.array(plannedAttractionOutputSchema).max(60),
    lodging:             lodgingOutputSchema.optional(),
  })).max(30),
  transits: z.array(z.object({
    fromCityId: idString,
    toCityId:   idString,
    date:       z.string().regex(DATE).optional(),
    segments:   z.array(segmentOutputSchema).max(6),
  })).max(30).default([]),
});
