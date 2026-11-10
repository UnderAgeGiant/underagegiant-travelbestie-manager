import { WeatherResponseDay } from '../../types';
import type { ItineraryExportBody } from '../../schemas/itinerary.schemas';
import { ItineraryLabels, ItineraryLocale } from './labels';

/** Loaded by loadItineraryContext before generation. Weather/FX failures degrade, never throw. */
export interface ItineraryContext {
  weather: Record<string, WeatherResponseDay[]>; // key = stop index as string
  usdRate: number | null;                         // units of body.currency per USD; null = USD only
  exportedAt: Date;
}

/** Export-body fields only the new frontend sends (F78). */
export type ItineraryDetails = Omit<ItineraryExportBody, 'cityNames' | 'attractionNames' | 'ticketRequiredIds' | 'attractionDurations' | 'locale'>;

/** Options every sheet builder receives: `(workbook, trip, opts)`. */
export interface ResolvedOptions {
  locale: ItineraryLocale;
  labels: ItineraryLabels;
  cityNames?: Record<string, string>;
  attractionNames?: Record<string, string>;
  ticketRequired: Set<string>;
  attractionDurations?: Record<string, number>;
  details: ItineraryDetails;
  context: ItineraryContext;
}
