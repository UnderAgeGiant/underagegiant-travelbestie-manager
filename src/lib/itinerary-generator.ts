import ExcelJS from 'exceljs';
import { Trip, TripStop, TransitLeg } from '../types';
import { CITY_NAMES } from '../data/cities';

export interface ItineraryOptions {
  trip: Trip;
  cityNames?: Record<string, string>;
  attractionNames?: Record<string, string>;
}

const MODE_LABELS: Record<string, string> = {
  flight: 'Vuelo',
  train: 'Tren',
  bus: 'Bus',
  boat: 'Ferry',
  car: 'Auto',
};

const TIME_SLOTS = Array.from({ length: 19 }, (_, i) => i + 5); // 5..23

function resolveCityName(cityId: string, overrides?: Record<string, string>): string {
  return overrides?.[cityId] ?? CITY_NAMES[cityId] ?? cityId;
}

function resolveAttractionName(
  attractionId: string,
  cityOverride: string,
  overrides?: Record<string, string>,
): string {
  if (overrides?.[attractionId]) return overrides[attractionId];
  // attractionId format: {cityId}_{index}
  const lastUnderscore = attractionId.lastIndexOf('_');
  if (lastUnderscore !== -1) {
    const index = parseInt(attractionId.slice(lastUnderscore + 1), 10);
    if (!isNaN(index)) return `${cityOverride} - Attraction ${index + 1}`;
  }
  return attractionId;
}

// dd/mm/yyyy → Date (UTC midnight)
function parseDMY(dmy: string): Date {
  const [d, m, y] = dmy.split('/');
  return new Date(Date.UTC(+y, +m - 1, +d));
}

// Date → dd/mm/yyyy key for comparison
function dateKey(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

// dd/mm/yyyy → "DD/MM" display label
function shortDate(dmy: string): string {
  return dmy.slice(0, 5);
}

// HH:mm → hour integer
function parseHour(hm: string): number {
  return parseInt(hm.split(':')[0], 10);
}

function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86400000);
}

// Build list of all days (dd/mm/yyyy) from checkIn of first stop to checkOut of last stop
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

// Determine which stop a day belongs to (checkIn ≤ day < checkOut, last stop inclusive on checkOut)
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

interface CellActivity {
  text: string;
  type: 'transit' | 'attraction';
}

// Collect all activities per day per hour slot
function buildActivityMap(
  days: string[],
  stops: TripStop[],
  transits: TransitLeg[],
  cityNames?: Record<string, string>,
  attractionNames?: Record<string, string>,
): Map<string, CellActivity[]> {
  // key: `${dayIndex}:${hour}`
  const map = new Map<string, CellActivity[]>();

  const push = (dayIdx: number, hour: number, activity: CellActivity) => {
    const key = `${dayIdx}:${hour}`;
    const list = map.get(key) ?? [];
    list.push(activity);
    map.set(key, list);
  };

  const dayIndex = new Map(days.map((d, i) => [d, i]));

  // Transit segments
  for (const leg of transits) {
    const fromCity = resolveCityName(leg.fromCityId, cityNames);
    const toCity = resolveCityName(leg.toCityId, cityNames);

    for (const seg of leg.segments) {
      const modeLabel = MODE_LABELS[seg.mode] ?? seg.mode;
      const depIdx = dayIndex.get(seg.departureDate);
      if (depIdx !== undefined) {
        const hour = parseHour(seg.departureTime);
        const notes = seg.notes ? ` (${seg.notes})` : '';
        push(depIdx, hour, {
          text: `${seg.departureTime} Sale ${modeLabel} → ${toCity}${notes}`,
          type: 'transit',
        });
      }
      const arrIdx = dayIndex.get(seg.arrivalDate);
      if (arrIdx !== undefined) {
        const hour = parseHour(seg.arrivalTime);
        push(arrIdx, hour, {
          text: `${seg.arrivalTime} Llega ${modeLabel} desde ${fromCity}`,
          type: 'transit',
        });
      }
    }
  }

  // Planned attractions
  for (const stop of stops) {
    const cityName = resolveCityName(stop.cityId, cityNames);
    for (const att of stop.selectedAttractions) {
      // Use att.date if available, else first day of stop
      const attDay = att.date ?? stop.checkIn;
      const idx = dayIndex.get(attDay);
      if (idx === undefined) continue;
      const hour = parseHour(att.startTime);
      const name = resolveAttractionName(att.attractionId, cityName, attractionNames);
      push(idx, hour, {
        text: `${att.startTime} ${name}`,
        type: 'attraction',
      });
    }
  }

  return map;
}

function applyTitleStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
}

function applyHeaderStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };
}

function applyCityStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };
}

function applyTimeSlotStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };
}

function applyActivityStyle(cell: ExcelJS.Cell, type: 'transit' | 'attraction' | 'empty'): void {
  const fgColor = type === 'transit' ? 'FFFEF9C3' : type === 'attraction' ? 'FFDCFCE7' : 'FFFFFFFF';
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fgColor } };
  cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  cell.border = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };
}

export async function buildItinerary(options: ItineraryOptions): Promise<Buffer> {
  const { trip, cityNames, attractionNames } = options;
  const { title, stops, transits } = trip;

  const days = buildDayRange(stops);
  const totalCols = days.length + 1; // col A = time, then one per day
  const activityMap = buildActivityMap(days, stops, transits, cityNames, attractionNames);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TravelBestie';
  const sheet = workbook.addWorksheet('Itinerario');

  // Column widths: A = 10, rest = 18
  sheet.getColumn(1).width = 10;
  for (let c = 2; c <= totalCols; c++) sheet.getColumn(c).width = 18;

  // --- Row 1: Title ---
  sheet.getRow(1).height = 28;
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  applyTitleStyle(titleCell);
  if (totalCols > 1) sheet.mergeCells(1, 1, 1, totalCols);

  // --- Row 2: blank spacer ---
  sheet.getRow(2).height = 8;

  // --- Row 3: Date headers ---
  sheet.getRow(3).height = 22;
  const headerCell = sheet.getCell(3, 1);
  headerCell.value = 'Horario/Día';
  applyHeaderStyle(headerCell);
  days.forEach((day, i) => {
    const cell = sheet.getCell(3, i + 2);
    cell.value = shortDate(day);
    applyHeaderStyle(cell);
  });

  // --- Row 4: City names ---
  sheet.getRow(4).height = 20;
  const cityLabelCell = sheet.getCell(4, 1);
  cityLabelCell.value = '';
  applyCityStyle(cityLabelCell);
  days.forEach((day, i) => {
    const cell = sheet.getCell(4, i + 2);
    cell.value = cityForDay(day, stops, cityNames);
    applyCityStyle(cell);
  });

  // --- Rows 5+: Time slots ---
  TIME_SLOTS.forEach((hour, rowOffset) => {
    const rowNum = 5 + rowOffset;
    sheet.getRow(rowNum).height = 35;

    const timeLabel = `${String(hour).padStart(2, '0')}:00`;
    const timeCell = sheet.getCell(rowNum, 1);
    timeCell.value = timeLabel;
    applyTimeSlotStyle(timeCell);

    days.forEach((_, dayIdx) => {
      const cell = sheet.getCell(rowNum, dayIdx + 2);
      const activities = activityMap.get(`${dayIdx}:${hour}`) ?? [];
      if (activities.length === 0) {
        applyActivityStyle(cell, 'empty');
      } else {
        cell.value = activities.map(a => a.text).join('\n');
        // Use type of first activity for cell color; transit takes precedence
        const dominant = activities.some(a => a.type === 'transit') ? 'transit' : 'attraction';
        applyActivityStyle(cell, dominant);
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
