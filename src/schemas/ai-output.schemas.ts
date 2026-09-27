import { z } from 'zod';
import { ID_PATTERN } from './ai.schemas';
import { clampText } from '../lib/clamp-text';

const DATE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;   // dd/mm/yyyy (model sometimes drops a leading zero)
const TIME = /^\d{1,2}:\d{2}$/;             // HH:mm
const HTTPS_URL = /^https:\/\/\S+$/;

const idString = z.string().max(120).regex(ID_PATTERN);

// Model-output schemas. z.object() strips unknown keys; .catch() replaces an invalid
// value instead of failing the whole response.

/**
 * Hard caps (chars) on AI-generated display text, chosen by the frontend from its layout
 * (2026-09-27). The prompts ask for a shorter target; anything over the cap is cut with '…'
 * — never failed, blanked or dropped over length alone (/ai/suggest charges karma before
 * the model call, and a failed /ai/plan throws away a whole long generation).
 */
export const AI_TEXT_CAPS = {
  suggestTitle:     60,
  suggestSummary:   300,
  highlight:        40,
  highlightsCount:  4,
  planTitle:        60,
  lodgingName:      80,
  lodgingAddress:   150,
  lodgingNotes:     200,
  segmentNotes:     80,
  segmentCarrier:   40,
} as const;

const clampedText = (max: number) => z.string().transform(s => clampText(s, max));

export const suggestOutputSchema = z.object({
  options: z.array(z.object({
    id:         z.number().int(),
    title:      z.string().min(1).pipe(clampedText(AI_TEXT_CAPS.suggestTitle)),
    summary:    z.string().min(1).pipe(clampedText(AI_TEXT_CAPS.suggestSummary)),
    highlights: z.array(clampedText(AI_TEXT_CAPS.highlight)).transform(h => h.slice(0, AI_TEXT_CAPS.highlightsCount)),
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
  name:    clampedText(AI_TEXT_CAPS.lodgingName),
  url:     z.string().max(500).regex(HTTPS_URL).catch(''),
  address: clampedText(AI_TEXT_CAPS.lodgingAddress).optional(),
  notes:   clampedText(AI_TEXT_CAPS.lodgingNotes).optional(),
});

const segmentOutputSchema = z.object({
  mode:            z.enum(['flight', 'train', 'boat', 'bus', 'car']),
  departureDate:   z.string().regex(DATE),
  departureTime:   z.string().regex(TIME),
  arrivalDate:     z.string().regex(DATE),
  arrivalTime:     z.string().regex(TIME),
  notes:           clampedText(AI_TEXT_CAPS.segmentNotes).catch(''),
  durationMinutes: z.number().int().min(0).max(10080).optional(),
  carrier:         clampedText(AI_TEXT_CAPS.segmentCarrier).optional(),
  locationUrl:     z.string().max(500).regex(HTTPS_URL).optional().catch(undefined),
});

export const planOutputSchema = z.object({
  title: z.string().min(1).pipe(clampedText(AI_TEXT_CAPS.planTitle)),
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
