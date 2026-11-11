import ExcelJS from 'exceljs';
import { Trip } from '../../types';
import { ResolvedOptions } from './types';
import { modeLabel } from './labels';
import { C, USD_FMT, applyDataCellStyle, currencyFmt, fill, freezeHeader, noteRow, sectionBar, titleStrip, writeHeaderRow } from './style';
import { costCategories, fmt, isoToDMYDate, plural, resolveCityName, travelersLine } from './util';

/** From the stored costEstimate only — the export never computes an estimate. */
export function buildCostosSheet(workbook: ExcelJS.Workbook, trip: Trip, opts: ResolvedOptions): void {
  const l = opts.labels;
  const { currency, siteUrl } = opts.details;
  const e = trip.costEstimate;
  const rate = e && currency ? opts.context.usdRate : null;
  const lastCol = rate ? 4 : 3;
  const sheet = workbook.addWorksheet(l.sheetCostos);
  sheet.columns = rate ? [{ width: 24 }, { width: 14 }, { width: 16 }, { width: 44 }] : [{ width: 24 }, { width: 14 }, { width: 44 }];

  if (!e) {
    titleStrip(sheet, l.costosTitle, trip.title, lastCol);
    freezeHeader(sheet, 2);
    noteRow(sheet, 4, l.costNeverCalculated, lastCol, { italic: true });
    if (siteUrl) noteRow(sheet, 5, { text: l.costCalculateCta, hyperlink: `${siteUrl}/my-trips` }, lastCol);
    return;
  }

  const comfort = { budget: l.comfortBudget, mid: l.comfortMid, luxury: l.comfortLuxury }[e.settings.comfort] ?? e.settings.comfort;
  const subtitle = [
    fmt(l.costosFor, { travelers: travelersLine(e.settings, l), comfort, date: isoToDMYDate(e.calculatedAt) }),
    rate ? fmt(l.fxRate, { rate: rate >= 10 ? Math.round(rate) : rate.toFixed(2), currency: currency! }) : '',
  ].filter(Boolean).join(' · ');
  titleStrip(sheet, l.costosTitle, subtitle, lastCol);
  writeHeaderRow(sheet, 3, rate ? [l.hdrConcept, 'USD', currency!, l.hdrNote] : [l.hdrConcept, 'USD', l.hdrNote]);
  freezeHeader(sheet, 3);

  let row = 4;
  const writeLine = (label: string, usd: number, note: string, style: 'plain' | 'total' | 'bold') => {
    const r = sheet.getRow(row++);
    const values: ExcelJS.CellValue[] = rate ? [label, usd, Math.round(usd * rate), note] : [label, usd, note];
    values.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v;
      const isNote = i === values.length - 1;
      applyDataCellStyle(cell, i === 0 || isNote ? 'left' : 'right');
      if (i === 1) cell.numFmt = USD_FMT;
      if (rate && i === 2) cell.numFmt = currencyFmt(currency!);
      if (isNote) cell.font = { ...cell.font, color: { argb: C.t2 } };
      if (style !== 'plain') cell.font = { ...cell.font, bold: true };
      if (style === 'total') cell.fill = fill(C.peach);
    });
  };

  const notes: Record<string, string> = {
    lodging: `${plural(e.nights, l.nightOne, l.nightMany)} · ${plural(e.rooms, l.roomOne, l.roomMany)}`,
    tickets: [
      plural(e.ticketCount, l.entryOne, l.entryMany),
      e.unpricedTicketCount ? fmt(l.unpriced, { n: e.unpricedTicketCount }) : '',
    ].filter(Boolean).join(' · '),
  };
  for (const cat of costCategories(e, l)) writeLine(cat.label, cat.usd, notes[cat.key] ?? '', 'plain');
  writeLine(l.costTotal, e.totalUsd, '', 'total');
  const payers = Math.max(1, e.settings.adults + e.settings.children); // infants travel free
  writeLine(l.costPerPerson, Math.round(e.totalUsd / payers), '', 'bold');

  row++;
  if (e.stale) noteRow(sheet, row++, l.costStale, lastCol, { italic: true, color: { argb: C.peachD } });
  if (e.missingOrigin) noteRow(sheet, row++, l.costMissingOrigin, lastCol, { italic: true });

  if (e.unestimated.length) {
    row++;
    sectionBar(sheet, row++, l.unestimatedSection, lastCol);
    const place = (id: string) => id === '__home__'
      ? (e.settings.origin?.name ?? trip.costSettings?.origin?.name ?? l.homeCity)
      : resolveCityName(id, l, opts.cityNames);
    for (const leg of e.unestimated) {
      noteRow(sheet, row++, fmt(l.unestimatedRow, { from: place(leg.from), to: place(leg.to), mode: modeLabel(l, leg.mode) }), lastCol);
    }
  }
}
