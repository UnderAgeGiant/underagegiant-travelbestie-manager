import { TripSuggestion } from '../types';

/**
 * The option the plan prompt expects when the user picked cities instead of a suggestion
 * (F79 first run, F84 simple flow). Mirrored byte-for-byte by the frontend
 * `core/ai/cities-plan-option.util.ts` (same fixture test): change both together.
 */
export function buildCitiesPlanOption(cities: { id: string; name: string }[], duration: number): TripSuggestion {
  const names = cities.map(c => c.name);
  return {
    id:         0,
    title:      `Viaje a ${names.join(', ')}`,
    summary:    `Itinerario de ${duration} días por ${names.join(', ')}`,
    highlights: names,
    cityIds:    cities.map(c => c.id),
  };
}
