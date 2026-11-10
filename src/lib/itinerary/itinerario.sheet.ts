import ExcelJS from 'exceljs';
import { Trip, TripStop, TransitLeg } from '../../types';
import { ResolvedOptions } from './types';
import { ItineraryLabels, modeLabel } from './labels';
import { C, ActivityStyle, applyActivityStyle, applyCityStyle, applyHeaderStyle, applyTimeSlotStyle, border, fill } from './style';
import { addDays, dateKey, fmt, parseDMY, resolveCityName, shortDate } from './util';

// Favicon rendered to PNG via Python/Pillow — gradient circle with TB monogram
const LOGO_PNG_BASE64 =
  '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';

const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => i); // 0..23

function parseHour(hm: string): number {
  return parseInt(hm.split(':')[0], 10);
}

function addMinutesToTime(hm: string, minutes: number): string {
  const [h, m] = hm.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function resolveAttractionName(attractionId: string, city: string, opts: ResolvedOptions): string {
  if (opts.attractionNames?.[attractionId]) return opts.attractionNames[attractionId];
  const lastUnderscore = attractionId.lastIndexOf('_');
  if (lastUnderscore !== -1) {
    const index = parseInt(attractionId.slice(lastUnderscore + 1), 10);
    if (!isNaN(index)) return fmt(opts.labels.attractionFallback, { city, n: index + 1 });
  }
  return attractionId;
}

export function buildDayRange(stops: TripStop[]): string[] {
  if (!stops.length) return [];
  const end = parseDMY(stops[stops.length - 1].checkOut);
  const days: string[] = [];
  for (let cur = parseDMY(stops[0].checkIn); cur <= end; cur = addDays(cur, 1)) days.push(dateKey(cur));
  return days;
}

/** Index of the stop a day belongs to (check-in ≤ day < check-out; the last stop also owns its check-out day), or -1. */
export function stopIndexForDay(day: string, stops: TripStop[]): number {
  const d = parseDMY(day);
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const isLast = i === stops.length - 1;
    if (d >= parseDMY(s.checkIn) && (d < parseDMY(s.checkOut) || (isLast && d <= parseDMY(s.checkOut)))) return i;
  }
  return -1;
}

interface TransitActivity {
  text: string;
  startLabel: string;   // HH:mm departure time of the segment this point belongs to
  endLabel: string;     // HH:mm arrival time of the segment this point belongs to
  name: string;         // e.g. "Vuelo Londres → París", used in collision comments
}

interface PlacedTransitBlock {
  dayIdx: number;
  startHour: number;
  endHour: number; // inclusive
  text: string;
  // Attractions whose own start hour falls inside this block's span get their
  // text attached here instead of becoming an independent PlacedBlock — once
  // ExcelJS merges startHour..endHour into one cell, sheet.getCell() on any
  // row in that range resolves to the same master cell, so a second
  // mergeCells()/value write there would silently clobber this block's text.
  extraLines?: string[];
}

// Same-day departures/arrivals stay as single-hour point markers (pointMap).
// A segment whose arrival date is after its departure date is split into one
// merged block per day it touches: departure hour → 23:00 on the first day,
// a full 00:00–23:00 block on any day fully in between, and 00:00 → arrival
// hour on the last day — so an overnight trip reads as one continuous block
// instead of two disconnected single-hour markers.
function buildTransitData(
  days: string[],
  transits: TransitLeg[],
  opts: ResolvedOptions,
): { pointMap: Map<string, TransitActivity[]>; blocks: PlacedTransitBlock[] } {
  const l = opts.labels;
  const pointMap = new Map<string, TransitActivity[]>();
  const blocks: PlacedTransitBlock[] = [];
  const pushPoint = (dayIdx: number, hour: number, activity: TransitActivity) => {
    const key = `${dayIdx}:${hour}`;
    const list = pointMap.get(key) ?? [];
    list.push(activity);
    pointMap.set(key, list);
  };
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  for (const leg of transits) {
    const fromCity = resolveCityName(leg.fromCityId, l, opts.cityNames);
    const toCity = resolveCityName(leg.toCityId, l, opts.cityNames);
    for (const seg of leg.segments) {
      const mode = modeLabel(l, seg.mode);
      const notes = seg.notes ? ` (${seg.notes})` : '';
      const depIdx = dayIndex.get(seg.departureDate);
      const arrIdx = dayIndex.get(seg.arrivalDate);
      const depHour = Math.max(0, Math.min(23, parseHour(seg.departureTime)));
      const arrHour = Math.max(0, Math.min(23, parseHour(seg.arrivalTime)));
      const departureText = fmt(l.transitDeparts, { time: seg.departureTime, mode, to: toCity }) + notes;
      const arrivalText = fmt(l.transitArrives, { time: seg.arrivalTime, mode, from: fromCity });
      const segmentName = `${mode} ${fromCity} → ${toCity}`;

      if (depIdx !== undefined && arrIdx !== undefined && arrIdx > depIdx) {
        blocks.push({ dayIdx: depIdx, startHour: depHour, endHour: 23, text: departureText });
        for (let d = depIdx + 1; d < arrIdx; d++) {
          blocks.push({ dayIdx: d, startHour: 0, endHour: 23, text: fmt(l.inTransit, { mode }) });
        }
        blocks.push({ dayIdx: arrIdx, startHour: 0, endHour: arrHour, text: arrivalText });
        continue;
      }

      if (depIdx !== undefined) {
        pushPoint(depIdx, depHour, { text: departureText, startLabel: seg.departureTime, endLabel: seg.arrivalTime, name: segmentName });
      }
      if (arrIdx !== undefined) {
        pushPoint(arrIdx, arrHour, { text: arrivalText, startLabel: seg.departureTime, endLabel: seg.arrivalTime, name: segmentName });
      }
    }
  }
  return { pointMap, blocks };
}

interface RawAttractionSpan {
  dayIdx: number;
  startHour: number;
  endHour: number;      // inclusive, before any transit-shrink
  startLabel: string;   // HH:mm
  endLabel: string;     // HH:mm — explicit endTime, or startTime + the estimated visit duration
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
  transitBlockOwner: Map<string, PlacedTransitBlock>,
  opts: ResolvedOptions,
): RawAttractionSpan[] {
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const raw: RawAttractionSpan[] = [];

  for (const stop of stops) {
    const cityName = resolveCityName(stop.cityId, opts.labels, opts.cityNames);
    for (const att of stop.selectedAttractions) {
      const attDay = att.date ?? stop.checkIn;
      const dayIdx = dayIndex.get(attDay);
      if (dayIdx === undefined || !att.startTime) continue;
      const startHour = Math.max(0, Math.min(23, parseHour(att.startTime)));
      const name = att.activityType
        ? (att.title ?? '')                                   // Feature 71 — personal activity, stored title
        : resolveAttractionName(att.attractionId!, cityName, opts);
      const ticketNeeded = !!att.attractionId && opts.ticketRequired.has(att.attractionId) && !att.ticketPurchased;

      // The attraction's own start hour already sits inside a merged overnight
      // transit block — there is no independent cell left to place it in, so
      // attach it to that block's text instead of creating a conflicting block.
      const owner = transitBlockOwner.get(`${dayIdx}:${startHour}`);
      if (owner) {
        owner.extraLines = owner.extraLines ?? [];
        owner.extraLines.push(`${ticketNeeded ? '🎟️ ' : ''}${att.startTime} ${name}`);
        continue;
      }

      const defaultMinutes = (att.attractionId ? opts.attractionDurations?.[att.attractionId] : undefined) ?? 60;
      const defaultHours = Math.max(1, Math.ceil(defaultMinutes / 60));
      const rawEndHour = att.endTime ? parseHour(att.endTime) : startHour + defaultHours;
      const endHour = Math.min(23, Math.max(startHour, rawEndHour - 1));
      // No explicit endTime — fall back to the curated visit-duration estimate
      // so the collision comment still shows a real end time instead of none.
      const endLabel = att.endTime ?? addMinutesToTime(att.startTime, defaultMinutes);
      raw.push({ dayIdx, startHour, endHour, startLabel: att.startTime, endLabel, name, ticketNeeded });
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
  transitOccupied: Set<string>,
  transitBlockOwner: Map<string, PlacedTransitBlock>,
  transitPointMap: Map<string, TransitActivity[]>,
  opts: ResolvedOptions,
): PlacedBlock[] {
  const raw = buildRawAttractionSpans(days, stops, transitBlockOwner, opts);
  const clusters = clusterOverlappingSpans(raw);
  const blocks: PlacedBlock[] = [];

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      const [span] = cluster;
      // Shrink the merge range so it never overwrites an hour a transit event occupies.
      let endHour = span.startHour;
      for (let h = span.startHour + 1; h <= span.endHour; h++) {
        if (transitOccupied.has(`${span.dayIdx}:${h}`)) break;
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
      // The warning cell also stacks any transit point (flight/train/etc.)
      // landing on this exact hour — list its full departure–arrival range
      // in the comment too, not just the attractions, so the tooltip
      // explains every item actually shown in the cell.
      const collidingPoints = transitPointMap.get(`${cluster[0].dayIdx}:${minStartHour}`) ?? [];
      const comment = [
        ...cluster.map(s => `${s.startLabel}${s.endLabel ? '–' + s.endLabel : ''} ${s.name}`),
        ...collidingPoints.map(p => `${p.startLabel}–${p.endLabel} ${p.name}`),
      ].join('\n');
      blocks.push({
        dayIdx: cluster[0].dayIdx, startHour: minStartHour, endHour: minStartHour,
        kind: 'conflict',
        text: fmt(opts.labels.overlap, { n: cluster.length }),
        comment,
      });
    }
  }
  return blocks;
}

export function buildItinerarioSheet(workbook: ExcelJS.Workbook, trip: Trip, opts: ResolvedOptions): void {
  const l: ItineraryLabels = opts.labels;
  const { title, stops, transits } = trip;

  const days = buildDayRange(stops);
  const totalCols = days.length + 1;
  const { pointMap: transitPointMap, blocks: transitBlocks } = buildTransitData(days, transits, opts);
  const transitOccupied = new Set<string>(transitPointMap.keys());
  const transitBlockByStartCell = new Map<string, PlacedTransitBlock>();
  const transitBlockCoveredCells = new Set<string>();
  const transitBlockOwner = new Map<string, PlacedTransitBlock>();
  for (const block of transitBlocks) {
    transitBlockByStartCell.set(`${block.dayIdx}:${block.startHour}`, block);
    for (let h = block.startHour; h <= block.endHour; h++) {
      const key = `${block.dayIdx}:${h}`;
      transitOccupied.add(key);
      transitBlockCoveredCells.add(key);
      transitBlockOwner.set(key, block);
    }
  }
  const attractionBlocks = buildAttractionBlocks(days, stops, transitOccupied, transitBlockOwner, transitPointMap, opts);
  const blockByStartCell = new Map<string, PlacedBlock>();
  const blockCoveredCells = new Set<string>();
  for (const block of attractionBlocks) {
    blockByStartCell.set(`${block.dayIdx}:${block.startHour}`, block);
    if (block.kind === 'solo') {
      for (let h = block.startHour; h <= block.endHour; h++) blockCoveredCells.add(`${block.dayIdx}:${h}`);
    }
  }

  const sheet = workbook.addWorksheet(l.sheetItinerario);

  sheet.getColumn(1).width = 10;
  for (let c = 2; c <= totalCols; c++) sheet.getColumn(c).width = 18;

  // --- Row 1: Title header (lav-d background, logo overlaid) ---
  sheet.getRow(1).height = 56;
  sheet.getCell(1, 1).fill = fill(C.lavD); // A1 gets just the background — logo floats on top
  const titleCell = sheet.getCell(1, 2);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: C.white }, name: 'Calibri' };
  titleCell.fill = fill(C.lavD);
  titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  if (totalCols > 2) sheet.mergeCells(1, 2, 1, totalCols);

  const logoId = workbook.addImage({ base64: LOGO_PNG_BASE64, extension: 'png' });
  sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 56, height: 56 } });

  // --- Row 2: Branding subtitle ---
  sheet.getRow(2).height = 20;
  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = l.subtitle;
  subtitleCell.font = { italic: true, size: 10, color: { argb: C.lavD }, name: 'Calibri' };
  subtitleCell.fill = fill(C.lav);
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  if (totalCols > 1) sheet.mergeCells(2, 1, 2, totalCols);

  // --- Row 3: Spacer ---
  sheet.getRow(3).height = 6;

  // --- Row 4: Date column headers ---
  sheet.getRow(4).height = 22;
  const headerLabelCell = sheet.getCell(4, 1);
  headerLabelCell.value = l.gridCorner;
  applyHeaderStyle(headerLabelCell);
  days.forEach((day, i) => {
    const cell = sheet.getCell(4, i + 2);
    cell.value = shortDate(day);
    applyHeaderStyle(cell);
  });

  // --- Row 5: City names ---
  sheet.getRow(5).height = 20;
  applyCityStyle(sheet.getCell(5, 1));
  days.forEach((day, i) => {
    const cell = sheet.getCell(5, i + 2);
    const stopIdx = stopIndexForDay(day, stops);
    cell.value = stopIdx === -1 ? '' : resolveCityName(stops[stopIdx].cityId, l, opts.cityNames);
    applyCityStyle(cell);
  });

  // --- Rows 6+: Time slots ---
  TIME_SLOTS.forEach((hour, rowOffset) => {
    const rowNum = 6 + rowOffset;
    sheet.getRow(rowNum).height = 35;

    const timeCell = sheet.getCell(rowNum, 1);
    timeCell.value = `${String(hour).padStart(2, '0')}:00`;
    applyTimeSlotStyle(timeCell);

    days.forEach((_, dayIdx) => {
      const key = `${dayIdx}:${hour}`;
      const col = dayIdx + 2;
      const cell = sheet.getCell(rowNum, col);
      const block = blockByStartCell.get(key);
      const transitBlock = transitBlockByStartCell.get(key);
      const pointActivities = transitPointMap.get(key) ?? [];

      if (block || transitBlock) {
        const lines = pointActivities.map(a => a.text);
        if (transitBlock) {
          lines.push(transitBlock.text);
          if (transitBlock.extraLines) lines.push(...transitBlock.extraLines);
        }
        if (block) {
          const prefix = block.kind === 'conflict' ? '' : (block.ticketNeeded ? '🎟️ ' : '');
          lines.push(prefix + block.text);
        }
        cell.value = lines.join('\n');
        if (block?.comment) cell.note = block.comment;

        const mergeEndOffset = Math.max(
          block?.kind === 'solo' ? block.endHour - block.startHour : 0,
          transitBlock ? transitBlock.endHour - transitBlock.startHour : 0,
        );
        if (mergeEndOffset > 0) sheet.mergeCells(rowNum, col, rowNum + mergeEndOffset, col);

        const style: ActivityStyle =
          pointActivities.length || transitBlock ? 'transit' :
          block?.kind === 'conflict' ? 'conflict' :
          block?.ticketNeeded ? 'ticket' : 'attraction';
        applyActivityStyle(cell, style);
        return;
      }
      if (blockCoveredCells.has(key) || transitBlockCoveredCells.has(key)) {
        return; // continuation row of a merged block above
      }

      if (pointActivities.length === 0) {
        applyActivityStyle(cell, 'empty');
      } else {
        cell.value = pointActivities.map(a => a.text).join('\n');
        applyActivityStyle(cell, 'transit');
      }
    });
  });

  // --- Legend (one blank spacer row below the last hour row) ---
  const legendStartRow = 6 + TIME_SLOTS.length + 1;
  const legendRows: Array<{ color: string; label: string }> = [
    { color: C.peach,  label: l.legendTicket },
    { color: C.mint,   label: l.legendAttraction },
    { color: C.lav,    label: l.legendTransit },
    { color: C.peachD, label: l.legendOverlap },
  ];
  legendRows.forEach((entry, i) => {
    const rowNum = legendStartRow + i;
    const swatch = sheet.getCell(rowNum, 1);
    swatch.fill = fill(entry.color);
    swatch.border = border();
    const label = sheet.getCell(rowNum, 2);
    label.value = entry.label;
    label.font = { size: 10, color: { argb: C.t1 }, name: 'Calibri' };
    label.alignment = { vertical: 'middle', horizontal: 'left' };
  });
}
