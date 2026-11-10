import ExcelJS from 'exceljs';
import { Trip } from './../types';
import { ItineraryLocale, labelsFor, resolveLocale } from './itinerary/labels';
import { ResolvedOptions } from './itinerary/types';
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
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tripilove';
  buildItinerarioSheet(workbook, trip, opts);
  buildTransporteSheet(workbook, trip, opts);
  buildHospedajeSheet(workbook, trip, opts);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
