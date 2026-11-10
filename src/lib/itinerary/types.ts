import { ItineraryLabels, ItineraryLocale } from './labels';

/** Options every sheet builder receives: `(workbook, trip, opts)`. */
export interface ResolvedOptions {
  locale: ItineraryLocale;
  labels: ItineraryLabels;
  cityNames?: Record<string, string>;
  attractionNames?: Record<string, string>;
  ticketRequired: Set<string>;
  attractionDurations?: Record<string, number>;
}
