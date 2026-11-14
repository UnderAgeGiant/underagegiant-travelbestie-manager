import { CatalogEntry, TripSuggestion } from '../types';
import { logger } from './logger';

/**
 * F79 cities mode: the prompt's preferences text, built server-side from the ticked cities
 * (the client's text never names them) plus the optional interest chips text.
 */
export function composeCitiesPreferences(cityIds: string[], cityIndex: CatalogEntry[], interests?: string): string {
  const names = cityIds.map(id => cityIndex.find(c => c.id === id)?.name ?? id).join(', ');
  const text = `Destinos elegidos (usa exactamente estas ciudades en cada opción; varía el orden, los días por ciudad y el enfoque): ${names}.`;
  return interests?.trim() ? `${text}\n${interests}` : text;
}

/** /ai/suggest prompt preferences: composed in cities mode, the client's text otherwise. */
export function suggestPromptPreferences(body: { cityIds?: string[]; cityIndex?: CatalogEntry[]; preferences?: string }): string {
  return body.cityIds?.length ? composeCitiesPreferences(body.cityIds, body.cityIndex ?? [], body.preferences) : body.preferences ?? '';
}

/** Keep options that stay inside the ticked cities. None left → unfiltered + warning (never empty). */
export function restrictToCities(options: TripSuggestion[], cityIds: string[]): TripSuggestion[] {
  const allowed = new Set(cityIds);
  const kept = options.filter(o => (o.cityIds?.length ?? 0) > 0 && o.cityIds!.every(id => allowed.has(id)));
  if (kept.length === 0) {
    logger.warn({ msg: 'AI suggest: no option stayed inside the chosen cities; returning unfiltered', cityIds });
    return options;
  }
  return kept;
}
