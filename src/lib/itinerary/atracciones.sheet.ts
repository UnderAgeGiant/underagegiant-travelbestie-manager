import ExcelJS from 'exceljs';
import { Trip } from '../../types';
import { ResolvedOptions } from './types';
import { C, applyDataCellStyle, applyLinkCellStyle, fill, freezeHeader, googleMapsSearchUrl, writeHeaderRow } from './style';
import { parseDMY, resolveCityName, sortKey } from './util';
import { addMinutesToTime, resolveAttractionName } from './itinerario.sheet';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const COL_WIDTHS = [12, 8, 8, 12, 30, 24, 16, 6, 14, 18, 12, 16, 14, 60];

interface Row {
  date: string;
  start: string;
  end: string;
  city: string;
  name: string;
  localName: string;
  type: string;
  rating: number | null;
  hours: string;
  ticket: string;
  tint: string;
  website?: string;
  buy?: string;
  maps?: string;
  description: string;
}

export function buildAtraccionesSheet(workbook: ExcelJS.Workbook, trip: Trip, opts: ResolvedOptions): void {
  const l = opts.labels;
  const sheet = workbook.addWorksheet(l.sheetAtracciones);
  sheet.columns = COL_WIDTHS.map(width => ({ width }));
  writeHeaderRow(sheet, 1, [
    l.hdrDay, l.hdrStart, l.hdrEnd, l.hdrCity, l.hdrAttraction, l.hdrLocalName, l.hdrMode, l.hdrRating,
    l.hdrHoursToday, l.hdrTicket, l.hdrWebsite, l.hdrBuyTicket, l.hdrMaps, l.hdrDescription,
  ]);
  freezeHeader(sheet, 1);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COL_WIDTHS.length } };

  const rows: Row[] = [];
  for (const stop of trip.stops) {
    const city = resolveCityName(stop.cityId, l, opts.cityNames);
    for (const att of stop.selectedAttractions) {
      const date = att.date ?? stop.checkIn;
      const start = att.startTime ?? '';
      if (att.activityType) {
        rows.push({
          date, start, end: att.endTime ?? '', city, name: att.title ?? '', localName: '',
          type: opts.details.personalLabels?.[att.activityType] ?? att.activityType,
          rating: null, hours: '', ticket: '', tint: C.butter, maps: att.mapsUrl, description: '',
        });
        continue;
      }
      const id = att.attractionId!;
      const d = opts.details.attractionDetails?.[id] ?? {};
      const name = resolveAttractionName(id, city, opts);
      const minutes = opts.attractionDurations?.[id];
      const slot = d.schedule?.[WEEKDAYS[parseDMY(date).getUTCDay()]];
      const required = opts.ticketRequired.has(id);
      const ticket = !required ? l.ticketNone : att.ticketPurchased ? l.ticketBought : l.ticketNeeded;
      rows.push({
        date, start,
        end: att.endTime ?? (start && minutes ? addMinutesToTime(start, minutes) : ''),
        city, name, localName: d.nativeName ?? '', type: d.type ?? '', rating: d.rating ?? null,
        hours: slot ? `${slot.open}–${slot.close}` : '',
        ticket, tint: required && !att.ticketPurchased ? C.peach : C.mint,
        website: d.website, buy: d.ticketUrl,
        maps: googleMapsSearchUrl(`${d.nativeName ?? name}, ${city}`),
        description: d.description ?? '',
      });
    }
  }
  // Undated-time entries sort after timed ones on the same day.
  rows.sort((a, b) => sortKey(a.date).localeCompare(sortKey(b.date)) || (a.start || '99').localeCompare(b.start || '99'));

  rows.forEach((r, i) => {
    const row = sheet.getRow(i + 2);
    row.height = 34;
    const values: ExcelJS.CellValue[] = [r.date, r.start, r.end, r.city, r.name, r.localName, r.type, r.rating, r.hours, r.ticket];
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v;
      applyDataCellStyle(cell, c === 1 || c === 2 || c === 7 ? 'center' : 'left');
    });
    row.getCell(5).fill = fill(r.tint);
    row.getCell(5).font = { ...row.getCell(5).font, bold: true };
    row.getCell(10).fill = fill(r.tint);
    const link = (col: number, text: string, url?: string) => {
      const cell = row.getCell(col);
      if (url) {
        cell.value = { text, hyperlink: url };
        applyLinkCellStyle(cell, 'left');
      } else {
        applyDataCellStyle(cell, 'left');
      }
    };
    link(11, l.linkWeb, r.website);
    link(12, l.linkBuy, r.buy);
    link(13, l.linkMap, r.maps);
    row.getCell(14).value = r.description;
    applyDataCellStyle(row.getCell(14), 'left');
  });
}
