import ExcelJS from 'exceljs';
import { Trip, TripStop, TransitLeg } from '../types';
import { CITY_NAMES } from '../data/cities';

export interface ItineraryOptions {
  trip: Trip;
  cityNames?: Record<string, string>;
  attractionNames?: Record<string, string>;
  ticketRequiredIds?: string[];
}

// Brand palette — derived from frontend styles.css (oklch tokens) and favicon.svg
const C = {
  lavD:   'FF7C3AED',  // --lav-d  oklch(55% .16 290)
  peachD: 'FFEA580C',  // --peach-d oklch(62% .15 50)
  lav:    'FFEDE9FE',  // --lav    oklch(88% .06 290)
  peach:  'FFFDE8D8',  // --peach  oklch(91% .07 50)
  mint:   'FFD1FAE5',  // --mint   oklch(91% .07 160)
  cream:  'FFF9F8F4',  // --cream  oklch(98% .01 80)
  white:  'FFFFFFFF',
  t1:     'FF1E1B4B',  // --t1     oklch(18% .02 270)
  t2:     'FF4B5180',  // --t2     oklch(42% .03 270)
  t3:     'FF9CA3AF',  // --t3     oklch(65% .02 270)
  border: 'FFE2E3EC',  // --border oklch(88% .015 270)
} as const;

// Favicon rendered to PNG via Python/Pillow — gradient circle with TB monogram
const LOGO_PNG_BASE64 =
  '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';

const MODE_LABELS: Record<string, string> = {
  flight: 'Vuelo',
  train: 'Tren',
  bus: 'Bus',
  boat: 'Ferry',
  car: 'Auto',
};

const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => i); // 0..23

function resolveCityName(cityId: string, overrides?: Record<string, string>): string {
  if (cityId === '__start__') return 'Origen';
  if (cityId === '__end__') return 'Destino';
  return overrides?.[cityId] ?? CITY_NAMES[cityId] ?? cityId;
}

function resolveAttractionName(
  attractionId: string,
  cityOverride: string,
  overrides?: Record<string, string>,
): string {
  if (overrides?.[attractionId]) return overrides[attractionId];
  const lastUnderscore = attractionId.lastIndexOf('_');
  if (lastUnderscore !== -1) {
    const index = parseInt(attractionId.slice(lastUnderscore + 1), 10);
    if (!isNaN(index)) return `${cityOverride} - Attraction ${index + 1}`;
  }
  return attractionId;
}

function parseDMY(dmy: string): Date {
  const [d, m, y] = dmy.split('/');
  return new Date(Date.UTC(+y, +m - 1, +d));
}

function dateKey(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

function shortDate(dmy: string): string {
  return dmy.slice(0, 5);
}

function parseHour(hm: string): number {
  return parseInt(hm.split(':')[0], 10);
}

function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86400000);
}

function buildDayRange(stops: TripStop[]): string[] {
  if (!stops.length) return [];
  const start = parseDMY(stops[0].checkIn);
  const end = parseDMY(stops[stops.length - 1].checkOut);
  const days: string[] = [];
  let cur = start;
  while (cur <= end) {
    days.push(dateKey(cur));
    cur = addDays(cur, 1);
  }
  return days;
}

function cityForDay(day: string, stops: TripStop[], cityNames?: Record<string, string>): string {
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const checkIn = parseDMY(s.checkIn);
    const checkOut = parseDMY(s.checkOut);
    const d = parseDMY(day);
    const isLast = i === stops.length - 1;
    if (d >= checkIn && (d < checkOut || (isLast && d <= checkOut))) {
      return resolveCityName(s.cityId, cityNames);
    }
  }
  return '';
}

interface TransitActivity {
  text: string;
}

function buildTransitMap(
  days: string[],
  transits: TransitLeg[],
  cityNames?: Record<string, string>,
): Map<string, TransitActivity[]> {
  const map = new Map<string, TransitActivity[]>();
  const push = (dayIdx: number, hour: number, activity: TransitActivity) => {
    const key = `${dayIdx}:${hour}`;
    const list = map.get(key) ?? [];
    list.push(activity);
    map.set(key, list);
  };
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  for (const leg of transits) {
    const fromCity = resolveCityName(leg.fromCityId, cityNames);
    const toCity = resolveCityName(leg.toCityId, cityNames);
    for (const seg of leg.segments) {
      const modeLabel = MODE_LABELS[seg.mode] ?? seg.mode;
      const depIdx = dayIndex.get(seg.departureDate);
      if (depIdx !== undefined) {
        const hour = Math.max(0, Math.min(23, parseHour(seg.departureTime)));
        const notes = seg.notes ? ` (${seg.notes})` : '';
        push(depIdx, hour, { text: `${seg.departureTime} Sale ${modeLabel} → ${toCity}${notes}` });
      }
      const arrIdx = dayIndex.get(seg.arrivalDate);
      if (arrIdx !== undefined) {
        const hour = Math.max(0, Math.min(23, parseHour(seg.arrivalTime)));
        push(arrIdx, hour, { text: `${seg.arrivalTime} Llega ${modeLabel} desde ${fromCity}` });
      }
    }
  }
  return map;
}

interface RawAttractionSpan {
  dayIdx: number;
  startHour: number;
  endHour: number;      // inclusive, before any transit-shrink
  startLabel: string;   // HH:mm
  endLabel: string;     // HH:mm, '' when the attraction has no explicit endTime
  name: string;
  ticketNeeded?: boolean;
}

interface PlacedBlock {
  dayIdx: number;
  startHour: number;
  endHour: number;       // inclusive; equals startHour for 'conflict' blocks
  kind: 'solo' | 'conflict';
  text: string;
  ticketNeeded?: boolean;
  comment?: string;
}

function buildRawAttractionSpans(
  days: string[],
  stops: TripStop[],
  cityNames?: Record<string, string>,
  attractionNames?: Record<string, string>,
  ticketRequiredIds?: Set<string>,
): RawAttractionSpan[] {
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const raw: RawAttractionSpan[] = [];

  for (const stop of stops) {
    const cityName = resolveCityName(stop.cityId, cityNames);
    for (const att of stop.selectedAttractions) {
      const attDay = att.date ?? stop.checkIn;
      const dayIdx = dayIndex.get(attDay);
      if (dayIdx === undefined || !att.startTime) continue;
      const startHour = Math.max(0, Math.min(23, parseHour(att.startTime)));
      const rawEndHour = att.endTime ? parseHour(att.endTime) : startHour + 1;
      const endHour = Math.min(23, Math.max(startHour, rawEndHour - 1));
      raw.push({
        dayIdx, startHour, endHour,
        startLabel: att.startTime,
        endLabel: att.endTime ?? '',
        name: resolveAttractionName(att.attractionId, cityName, attractionNames),
        ticketNeeded: !!ticketRequiredIds?.has(att.attractionId) && !att.ticketPurchased,
      });
    }
  }
  return raw;
}

// Groups, per day, any spans whose hour ranges transitively overlap.
function clusterOverlappingSpans(spans: RawAttractionSpan[]): RawAttractionSpan[][] {
  const byDay = new Map<number, RawAttractionSpan[]>();
  for (const span of spans) {
    const list = byDay.get(span.dayIdx) ?? [];
    list.push(span);
    byDay.set(span.dayIdx, list);
  }

  const clusters: RawAttractionSpan[][] = [];
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startHour - b.startHour);
    let current: RawAttractionSpan[] = [];
    let currentEnd = -1;
    for (const span of list) {
      if (current.length === 0 || span.startHour > currentEnd) {
        if (current.length) clusters.push(current);
        current = [span];
        currentEnd = span.endHour;
      } else {
        current.push(span);
        currentEnd = Math.max(currentEnd, span.endHour);
      }
    }
    if (current.length) clusters.push(current);
  }
  return clusters;
}

function buildAttractionBlocks(
  days: string[],
  stops: TripStop[],
  transitMap: Map<string, TransitActivity[]>,
  cityNames?: Record<string, string>,
  attractionNames?: Record<string, string>,
  ticketRequiredIds?: Set<string>,
): PlacedBlock[] {
  const raw = buildRawAttractionSpans(days, stops, cityNames, attractionNames, ticketRequiredIds);
  const clusters = clusterOverlappingSpans(raw);
  const blocks: PlacedBlock[] = [];

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      const [span] = cluster;
      // Shrink the merge range so it never overwrites an hour a transit event occupies.
      let endHour = span.startHour;
      for (let h = span.startHour + 1; h <= span.endHour; h++) {
        if (transitMap.has(`${span.dayIdx}:${h}`)) break;
        endHour = h;
      }
      blocks.push({
        dayIdx: span.dayIdx, startHour: span.startHour, endHour,
        kind: 'solo',
        text: `${span.startLabel} ${span.name}`,
        ticketNeeded: span.ticketNeeded,
      });
    } else {
      const minStartHour = Math.min(...cluster.map(s => s.startHour));
      const comment = cluster
        .map(s => `${s.startLabel}${s.endLabel ? '–' + s.endLabel : ''} ${s.name}`)
        .join('\n');
      blocks.push({
        dayIdx: cluster[0].dayIdx, startHour: minStartHour, endHour: minStartHour,
        kind: 'conflict',
        text: `⚠️ ${cluster.length} atracciones se superponen`,
        comment,
      });
    }
  }
  return blocks;
}

function border(): Partial<ExcelJS.Borders> {
  const side: ExcelJS.Border = { style: 'thin', color: { argb: C.border } };
  return { top: side, bottom: side, left: side, right: side };
}

function applyHeaderStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 11, color: { argb: C.white }, name: 'Calibri' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.lavD } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = border();
}

function applyCityStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 10, color: { argb: C.lavD }, name: 'Calibri' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.lav } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = border();
}

function applyTimeSlotStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 10, color: { argb: C.t1 }, name: 'Calibri' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.cream } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = border();
}

function applyActivityStyle(cell: ExcelJS.Cell, type: 'transit' | 'attraction' | 'ticket' | 'conflict' | 'empty'): void {
  const fgColor =
    type === 'transit'    ? C.lav :
    type === 'ticket'     ? C.peach :
    type === 'conflict'   ? C.peachD :
    type === 'attraction' ? C.mint :
    C.white;
  const textColor = type === 'conflict' ? C.white : C.t1;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fgColor } };
  cell.font = { size: 10, bold: type === 'conflict', color: { argb: textColor }, name: 'Calibri' };
  cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  cell.border = border();
}

function parseDateTime(dmy: string, hm: string): number {
  const [d, m, y] = dmy.split('/').map(Number);
  const [hh, mi] = hm.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mi);
}

function computeSegmentMinutes(seg: { departureDate: string; departureTime: string; arrivalDate: string; arrivalTime: string }): number {
  const dep = parseDateTime(seg.departureDate, seg.departureTime);
  const arr = parseDateTime(seg.arrivalDate, seg.arrivalTime);
  return Math.max(0, Math.round((arr - dep) / 60000));
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  return h > 0 ? `${h}h` : `${m}m`;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.max(0, Math.round((parseDMY(checkOut).getTime() - parseDMY(checkIn).getTime()) / 86400000));
}

function applyDataCellStyle(cell: ExcelJS.Cell, align: 'left' | 'center' = 'center'): void {
  cell.font = { size: 10, color: { argb: C.t1 }, name: 'Calibri' };
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true };
  cell.border = border();
}

function applyLinkCellStyle(cell: ExcelJS.Cell): void {
  cell.font = { size: 10, color: { argb: C.lavD }, name: 'Calibri', underline: true };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = border();
}

function buildTransporteSheet(
  workbook: ExcelJS.Workbook,
  trip: Trip,
  cityNames?: Record<string, string>,
): void {
  const sheet = workbook.addWorksheet('Transporte');
  sheet.columns = [
    { width: 26 }, { width: 14 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 18 }, { width: 14 },
  ];

  const headers = ['Ruta', 'Día', 'Hora Salida', 'Hora Llegada', 'Duración', 'Tipo', 'Empresa', 'Ubicación'];
  const headerRow = sheet.getRow(1);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    applyHeaderStyle(cell);
  });

  let rowNum = 2;
  for (const leg of trip.transits) {
    const fromCity = resolveCityName(leg.fromCityId, cityNames);
    const toCity = resolveCityName(leg.toCityId, cityNames);
    for (const seg of leg.segments) {
      const row = sheet.getRow(rowNum++);
      row.getCell(1).value = `${fromCity} - ${toCity}`;
      row.getCell(2).value = seg.departureDate;
      row.getCell(3).value = seg.departureTime;
      row.getCell(4).value = seg.arrivalTime;
      row.getCell(5).value = formatDuration(computeSegmentMinutes(seg));
      row.getCell(6).value = MODE_LABELS[seg.mode] ?? seg.mode;
      row.getCell(7).value = seg.carrier ?? '';
      if (seg.locationUrl) {
        row.getCell(8).value = { text: 'Ver mapa', hyperlink: seg.locationUrl };
        applyLinkCellStyle(row.getCell(8));
      } else {
        applyDataCellStyle(row.getCell(8));
      }
      applyDataCellStyle(row.getCell(1), 'left');
      for (let c = 2; c <= 7; c++) applyDataCellStyle(row.getCell(c));
    }
  }
}

function buildHospedajeSheet(
  workbook: ExcelJS.Workbook,
  trip: Trip,
  cityNames?: Record<string, string>,
): void {
  const sheet = workbook.addWorksheet('Hospedaje');
  sheet.columns = [
    { width: 16 }, { width: 14 }, { width: 14 }, { width: 24 },
    { width: 10 }, { width: 28 }, { width: 14 }, { width: 34 },
  ];

  const headers = ['Ciudad', 'Día Llegada', 'Día Salida', 'Nombre', 'Noches', 'Dirección', 'Ubicación', 'Observaciones'];
  const headerRow = sheet.getRow(1);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    applyHeaderStyle(cell);
  });

  let rowNum = 2;
  for (const stop of trip.stops) {
    if (!stop.lodging) continue;
    const row = sheet.getRow(rowNum++);
    row.getCell(1).value = resolveCityName(stop.cityId, cityNames);
    row.getCell(2).value = stop.checkIn;
    row.getCell(3).value = stop.checkOut;
    row.getCell(4).value = stop.lodging.name;
    row.getCell(5).value = nightsBetween(stop.checkIn, stop.checkOut);
    row.getCell(6).value = stop.lodging.address ?? '';
    if (stop.lodging.url) {
      row.getCell(7).value = { text: 'Ver mapa', hyperlink: stop.lodging.url };
      applyLinkCellStyle(row.getCell(7));
    } else {
      applyDataCellStyle(row.getCell(7));
    }
    row.getCell(8).value = stop.lodging.notes ?? '';
    applyDataCellStyle(row.getCell(1));
    applyDataCellStyle(row.getCell(2));
    applyDataCellStyle(row.getCell(3));
    applyDataCellStyle(row.getCell(4), 'left');
    applyDataCellStyle(row.getCell(5));
    applyDataCellStyle(row.getCell(6), 'left');
    applyDataCellStyle(row.getCell(8), 'left');
  }
}

export async function buildItinerary(options: ItineraryOptions): Promise<Buffer> {
  const { trip, cityNames, attractionNames, ticketRequiredIds } = options;
  const { title, stops, transits } = trip;

  const days = buildDayRange(stops);
  const totalCols = days.length + 1;
  const ticketRequiredSet = ticketRequiredIds ? new Set(ticketRequiredIds) : undefined;
  const transitMap = buildTransitMap(days, transits, cityNames);
  const attractionBlocks = buildAttractionBlocks(days, stops, transitMap, cityNames, attractionNames, ticketRequiredSet);
  const blockByStartCell = new Map<string, PlacedBlock>();
  const blockCoveredCells = new Set<string>();
  for (const block of attractionBlocks) {
    blockByStartCell.set(`${block.dayIdx}:${block.startHour}`, block);
    if (block.kind === 'solo') {
      for (let h = block.startHour; h <= block.endHour; h++) blockCoveredCells.add(`${block.dayIdx}:${h}`);
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tripilove';
  const sheet = workbook.addWorksheet('Itinerario');

  sheet.getColumn(1).width = 10;
  for (let c = 2; c <= totalCols; c++) sheet.getColumn(c).width = 18;

  // --- Row 1: Title header (lav-d background, logo overlaid) ---
  sheet.getRow(1).height = 56;
  // A1 gets just the background — logo floats on top
  const a1 = sheet.getCell(1, 1);
  a1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.lavD } };
  // B1:end — trip title
  const titleCell = sheet.getCell(1, 2);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: C.white }, name: 'Calibri' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.lavD } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  if (totalCols > 2) sheet.mergeCells(1, 2, 1, totalCols);

  // Logo image overlaid at top-left of A1
  const logoId = workbook.addImage({ base64: LOGO_PNG_BASE64, extension: 'png' });
  sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 56, height: 56 } });

  // --- Row 2: Branding subtitle ---
  sheet.getRow(2).height = 20;
  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = 'Tripilove · Tu viaje ideal ✈';
  subtitleCell.font = { italic: true, size: 10, color: { argb: C.lavD }, name: 'Calibri' };
  subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.lav } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  if (totalCols > 1) sheet.mergeCells(2, 1, 2, totalCols);

  // --- Row 3: Spacer ---
  sheet.getRow(3).height = 6;

  // --- Row 4: Date column headers ---
  sheet.getRow(4).height = 22;
  const headerLabelCell = sheet.getCell(4, 1);
  headerLabelCell.value = 'Horario / Día';
  applyHeaderStyle(headerLabelCell);
  days.forEach((day, i) => {
    const cell = sheet.getCell(4, i + 2);
    cell.value = shortDate(day);
    applyHeaderStyle(cell);
  });

  // --- Row 5: City names ---
  sheet.getRow(5).height = 20;
  const cityLabelCell = sheet.getCell(5, 1);
  cityLabelCell.value = '';
  applyCityStyle(cityLabelCell);
  days.forEach((day, i) => {
    const cell = sheet.getCell(5, i + 2);
    cell.value = cityForDay(day, stops, cityNames);
    applyCityStyle(cell);
  });

  // --- Rows 6+: Time slots ---
  TIME_SLOTS.forEach((hour, rowOffset) => {
    const rowNum = 6 + rowOffset;
    sheet.getRow(rowNum).height = 35;

    const timeLabel = `${String(hour).padStart(2, '0')}:00`;
    const timeCell = sheet.getCell(rowNum, 1);
    timeCell.value = timeLabel;
    applyTimeSlotStyle(timeCell);

    days.forEach((_, dayIdx) => {
      const key = `${dayIdx}:${hour}`;
      const col = dayIdx + 2;
      const cell = sheet.getCell(rowNum, col);
      const block = blockByStartCell.get(key);
      const transitActivities = transitMap.get(key) ?? [];

      if (block) {
        const prefix = block.kind === 'conflict' ? '' : (block.ticketNeeded ? '🎟️ ' : '');
        const parts = [...transitActivities.map(a => a.text), prefix + block.text];
        cell.value = parts.join('\n');
        if (block.comment) cell.note = block.comment;
        if (block.kind === 'solo' && block.endHour > block.startHour) {
          sheet.mergeCells(rowNum, col, rowNum + (block.endHour - block.startHour), col);
        }
        const style =
          transitActivities.length ? 'transit' :
          block.kind === 'conflict' ? 'conflict' :
          block.ticketNeeded ? 'ticket' : 'attraction';
        applyActivityStyle(cell, style);
        return;
      }
      if (blockCoveredCells.has(key)) {
        return; // continuation row of a merged solo attraction block above
      }

      if (transitActivities.length === 0) {
        applyActivityStyle(cell, 'empty');
      } else {
        cell.value = transitActivities.map(a => a.text).join('\n');
        applyActivityStyle(cell, 'transit');
      }
    });
  });

  // --- Legend (4 rows, one blank spacer row below the last hour row) ---
  const legendStartRow = 6 + TIME_SLOTS.length + 1;
  const legendRows: Array<{ color: string; label: string }> = [
    { color: C.peach,  label: 'Necesita comprar entrada' },
    { color: C.mint,   label: 'Atracción' },
    { color: C.lav,    label: 'Transporte' },
    { color: C.peachD, label: 'Atracciones superpuestas (ver comentario en la celda)' },
  ];
  legendRows.forEach((entry, i) => {
    const rowNum = legendStartRow + i;
    const swatch = sheet.getCell(rowNum, 1);
    swatch.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: entry.color } };
    swatch.border = border();
    const label = sheet.getCell(rowNum, 2);
    label.value = entry.label;
    label.font = { size: 10, color: { argb: C.t1 }, name: 'Calibri' };
    label.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  buildTransporteSheet(workbook, trip, cityNames);
  buildHospedajeSheet(workbook, trip, cityNames);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
