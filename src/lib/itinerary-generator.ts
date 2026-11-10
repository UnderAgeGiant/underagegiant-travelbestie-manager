import ExcelJS from 'exceljs';
import { Trip } from './../types';
import { ItineraryLocale, labelsFor, resolveLocale } from './itinerary/labels';
import { ItineraryContext, ItineraryDetails, ResolvedOptions } from './itinerary/types';
import { buildItinerarioSheet } from './itinerary/itinerario.sheet';
import { buildTransporteSheet } from './itinerary/transporte.sheet';
import { buildHospedajeSheet } from './itinerary/hospedaje.sheet';

export interface ItineraryOptions {
  trip: Trip;
  locale?: ItineraryLocale;
  cityNames?: Record<string, string>;
  attractionNames?: Record<string, string>;
  ticketRequiredIds?: string[];
  attractionDurations?: Record<string, number>; // attractionId → estimatedMinutes, from the curated catalog (backend has no access to it)
  details?: ItineraryDetails;                   // F78 — catalog details + destination facts from the frontend
  context?: ItineraryContext;                   // F78 — weather + FX loaded by loadItineraryContext
}

export async function buildItinerary(options: ItineraryOptions): Promise<Buffer> {
  const { trip } = options;
  const locale = resolveLocale(options.locale);
  const opts: ResolvedOptions = {
    locale,
    labels: labelsFor(locale),
    cityNames: options.cityNames,
    attractionNames: options.attractionNames,
    ticketRequired: new Set(options.ticketRequiredIds ?? []),
    attractionDurations: options.attractionDurations,
    details: options.details ?? {},
    context: options.context ?? { weather: {}, usdRate: null, exportedAt: new Date() },
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tripilove';
  buildItinerarioSheet(workbook, trip, opts);
  buildTransporteSheet(workbook, trip, opts);
  buildHospedajeSheet(workbook, trip, opts);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
