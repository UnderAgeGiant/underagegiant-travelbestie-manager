import ExcelJS from 'exceljs';
import { Trip } from './../types';
import { ItineraryLocale, labelsFor, resolveLocale } from './itinerary/labels';
import { ItineraryContext, ItineraryDetails, ResolvedOptions } from './itinerary/types';
import { buildResumenSheet } from './itinerary/resumen.sheet';
import { buildItinerarioSheet } from './itinerary/itinerario.sheet';
import { buildAtraccionesSheet } from './itinerary/atracciones.sheet';
import { buildCostosSheet } from './itinerary/costos.sheet';
import { buildClimaSheet } from './itinerary/clima.sheet';
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
  // Tab order is part of the contract: Resumen → Itinerario → Atracciones → Costos → Clima → Antes de viajar → Transporte → Hospedaje.
  buildResumenSheet(workbook, trip, opts);
  buildItinerarioSheet(workbook, trip, opts);
  buildAtraccionesSheet(workbook, trip, opts);
  buildCostosSheet(workbook, trip, opts);
  buildClimaSheet(workbook, trip, opts);
  workbook.addWorksheet(opts.labels.sheetAntes);
  buildTransporteSheet(workbook, trip, opts);
  buildHospedajeSheet(workbook, trip, opts);
  workbook.views = [{ x: 0, y: 0, width: 12000, height: 24000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
