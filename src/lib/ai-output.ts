import { suggestOutputSchema, planOutputSchema } from '../schemas/ai-output.schemas';
import { ID_PATTERN } from '../schemas/ai.schemas';
import type { SuggestTripsResponse, PlanTripResponse, CatalogEntry, CityCatalog } from '../types';

/** Validates /ai/suggest model output. Throws ZodError on structural violations; drops cityIds not in the sent index (or malformed ones when no index was sent). */
export function sanitizeSuggestOutput(raw: unknown, cityIndex?: CatalogEntry[]): SuggestTripsResponse {
  const parsed = suggestOutputSchema.parse(raw);
  const allowed = cityIndex && cityIndex.length > 0 ? new Set(cityIndex.map(c => c.id)) : null;
  const options = parsed.options.map(o => ({
    ...o,
    cityIds: (o.cityIds ?? []).filter(id => ID_PATTERN.test(id) && (!allowed || allowed.has(id))),
  }));
  return { options: [options[0], options[1]] };
}

/** Validates /ai/plan model output. Throws ZodError on structural violations; drops attractions whose ID is outside the sent catalog (catalogued cities) or malformed (uncatalogued cities). */
export function sanitizePlanOutput(raw: unknown, cityCatalog?: CityCatalog): PlanTripResponse {
  const parsed = planOutputSchema.parse(raw);
  return {
    title: parsed.title,
    stops: parsed.stops.map(stop => {
      const catalogIds = cityCatalog?.[stop.cityId] ? new Set(cityCatalog[stop.cityId].map(e => e.id)) : null;
      return {
        ...stop,
        selectedAttractions: stop.selectedAttractions
          .filter(a => ID_PATTERN.test(a.attractionId) && (!catalogIds || catalogIds.has(a.attractionId)))
          .map(a => ({ attractionId: a.attractionId, startTime: a.startTime ?? null, endTime: a.endTime ?? null, date: a.date })),
      };
    }),
    transits: parsed.transits,
  };
}

/** Cap on the free-text `reason` of /ai/suggest-attractions and /ai/suggest-companion suggestions. The prompts ask for one short sentence; anything longer is treated as invalid output. */
export const REASON_MAX_CHARS = 300;

export function hasValidReason(s: { reason?: unknown }): boolean {
  return typeof s.reason === 'string' && s.reason.length > 0 && s.reason.length <= REASON_MAX_CHARS;
}
