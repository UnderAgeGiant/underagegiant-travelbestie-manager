import ExcelJS from 'exceljs';
import { Trip } from '../../types';
import { ResolvedOptions } from './types';
import { C, applyDataCellStyle, applyLinkCellStyle, freezeHeader, labelRow, sectionBar, titleStrip } from './style';
import { fmt, resolveCityName, shortDate } from './util';
import { resolveAttractionName } from './itinerario.sheet';

const LAST_COL = 3;

/** Destination facts come from the frontend (backend has no visa/currency/plug data); the checklist only from the plan. */
export function buildAntesDeViajarSheet(workbook: ExcelJS.Workbook, trip: Trip, opts: ResolvedOptions): void {
  const l = opts.labels;
  const sheet = workbook.addWorksheet(l.sheetAntes);
  sheet.columns = [{ width: 18 }, { width: 50 }, { width: 18 }];
  titleStrip(sheet, l.antesTitle, l.antesSubtitle, LAST_COL);
  freezeHeader(sheet, 2);

  let row = 4;
  for (const d of opts.details.destinations ?? []) {
    const cities = d.cities.map(c => c.name).join(', ');
    sectionBar(sheet, row++, `${d.flag ? d.flag + ' ' : ''}${d.country}${cities ? ' — ' + cities : ''}`, LAST_COL);
    const times = d.cities.filter(c => c.timeDiff).map(c => `${c.name}: ${c.timeDiff}`).join(' · ');
    const facts: Array<[string, string | undefined]> = [
      [l.factVisa, d.visa], [l.factCurrency, d.currency], [l.factPlug, d.plug], [l.factTime, times || undefined],
    ];
    for (const [label, value] of facts) if (value) labelRow(sheet, row++, label, value, LAST_COL);
    row++;
  }

  sectionBar(sheet, row++, l.checklistSection, LAST_COL);
  const item = (text: string, done = false, buyUrl?: string) => {
    sheet.mergeCells(row, 1, row, 2);
    const a = sheet.getCell(row, 1);
    a.value = text;
    applyDataCellStyle(a, 'left');
    if (done) a.font = { ...a.font, color: { argb: C.t3 } };
    const c = sheet.getCell(row, 3);
    if (buyUrl) {
      c.value = { text: l.linkBuy, hyperlink: buyUrl };
      applyLinkCellStyle(c, 'left');
    } else {
      applyDataCellStyle(c, 'left');
    }
    row++;
  };

  // Tickets, in trip order (stop order, then date/time within the stop).
  for (const stop of trip.stops) {
    const city = resolveCityName(stop.cityId, l, opts.cityNames);
    const ticketed = stop.selectedAttractions
      .filter(a => a.attractionId && opts.ticketRequired.has(a.attractionId))
      .map(a => ({ a, date: a.date ?? stop.checkIn }))
      .sort((x, y) => x.date.split('/').reverse().join('').localeCompare(y.date.split('/').reverse().join(''))
        || (x.a.startTime ?? '').localeCompare(y.a.startTime ?? ''));
    for (const { a, date } of ticketed) {
      const name = resolveAttractionName(a.attractionId!, city, opts);
      if (a.ticketPurchased) item(fmt(l.chkTicketBought, { name, date: shortDate(date) }), true);
      else item(fmt(l.chkBuyTicket, { name, date: shortDate(date) }), false, opts.details.attractionDetails?.[a.attractionId!]?.ticketUrl);
    }
  }
  for (const stop of trip.stops) {
    if (!stop.lodging) item(fmt(l.chkLodging, { city: resolveCityName(stop.cityId, l, opts.cityNames) }));
  }
  for (const leg of trip.transits) {
    const from = resolveCityName(leg.fromCityId, l, opts.cityNames);
    const to = resolveCityName(leg.toCityId, l, opts.cityNames);
    for (const seg of leg.segments) {
      item(fmt(l.chkTransport, { from, to, when: `${shortDate(seg.departureDate)} ${seg.departureTime}` }));
    }
  }
}
