import ExcelJS from 'exceljs';
import { Trip } from '../../types';
import { ResolvedOptions } from './types';
import { C, USD_FMT, applyDataCellStyle, applyHeaderStyle, applyLinkCellStyle, currencyFmt, fill, freezeHeader, labelRow, noteRow, sectionBar, titleStrip } from './style';
import { costCategories, fmt, isoToDMYDate, nightsBetween, plural, resolveCityName, travelersLine } from './util';

const LAST_COL = 5;

/** The tabs the Resumen index links to, in workbook order (Resumen itself excluded). */
function indexEntries(opts: ResolvedOptions): Array<[string, string]> {
  const l = opts.labels;
  return [
    [l.sheetItinerario, l.idxItinerario],
    [l.sheetAtracciones, l.idxAtracciones],
    [l.sheetCostos, l.idxCostos],
    [l.sheetClima, l.idxClima],
    [l.sheetAntes, l.idxAntes],
    [l.sheetTransporte, l.idxTransporte],
    [l.sheetHospedaje, l.idxHospedaje],
  ];
}

export function buildResumenSheet(workbook: ExcelJS.Workbook, trip: Trip, opts: ResolvedOptions): void {
  const l = opts.labels;
  const { siteUrl, currency } = opts.details;
  const sheet = workbook.addWorksheet(l.sheetResumen);
  sheet.columns = [{ width: 24 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 28 }];

  titleStrip(sheet, `✈ ${trip.title}`, l.subtitle, LAST_COL);
  freezeHeader(sheet, 2);

  let row = 4;
  const stops = trip.stops;
  if (stops.length) {
    const from = stops[0].checkIn;
    const to = stops[stops.length - 1].checkOut;
    const nights = nightsBetween(from, to);
    labelRow(sheet, row++, l.resDates,
      `${from} → ${to} · ${plural(nights + 1, l.dayOne, l.dayMany)} · ${plural(nights, l.nightOne, l.nightMany)}`, LAST_COL);

    const home = trip.costSettings?.origin?.name;
    const cities = stops.map(s =>
      `${resolveCityName(s.cityId, l, opts.cityNames)} (${plural(nightsBetween(s.checkIn, s.checkOut), l.nightOne, l.nightMany)})`);
    labelRow(sheet, row++, l.resRoute, [home, ...cities, home].filter(Boolean).join(' → '), LAST_COL);
  }
  if (trip.costSettings) labelRow(sheet, row++, l.resTravelers, travelersLine(trip.costSettings, l), LAST_COL);
  if (trip.shareId && siteUrl) {
    const url = `${siteUrl}/shared/${trip.shareId}`;
    labelRow(sheet, row++, l.resLink, { text: url, hyperlink: url }, LAST_COL);
  }

  // --- Cost block ---
  row++;
  sectionBar(sheet, row++, l.costSection, LAST_COL);
  const e = trip.costEstimate;
  if (!e) {
    noteRow(sheet, row++, l.costNeverCalculated, LAST_COL, { italic: true });
    if (siteUrl) noteRow(sheet, row++, { text: l.costCalculateCta, hyperlink: `${siteUrl}/my-trips` }, LAST_COL);
  } else {
    const rate = currency ? opts.context.usdRate : null;
    const cols: Array<'label' | 'usd' | 'cur' | 'share'> = rate ? ['label', 'usd', 'cur', 'share'] : ['label', 'usd', 'share'];
    const header: Record<string, string> = { label: l.costCategory, usd: 'USD', cur: currency ?? '', share: l.costShare };
    sheet.getRow(row).height = 30;
    for (let c = 1; c <= LAST_COL; c++) {
      const cell = sheet.getCell(row, c);
      cell.value = c <= cols.length ? header[cols[c - 1]] : '';
      applyHeaderStyle(cell);
    }
    row++;

    const writeLine = (label: string, usd: number, total: boolean, note = '') => {
      const values: Record<string, ExcelJS.CellValue> = {
        label, usd, cur: rate ? Math.round(usd * rate) : null, share: total || !e.totalUsd ? null : usd / e.totalUsd,
      };
      const formats: Record<string, string> = { usd: USD_FMT, cur: currencyFmt(currency ?? ''), share: '0%' };
      for (let c = 1; c <= LAST_COL; c++) {
        const key = cols[c - 1];
        const cell = sheet.getCell(row, c);
        cell.value = key ? values[key] : (c === LAST_COL ? note : null);
        applyDataCellStyle(cell, key === 'label' ? 'left' : 'right');
        if (key && formats[key]) cell.numFmt = formats[key];
        if (total) {
          cell.fill = fill(C.peach);
          cell.font = { ...cell.font, bold: true };
        }
      }
      row++;
    };
    for (const cat of costCategories(e, l)) writeLine(cat.label, cat.usd, false);
    writeLine(l.costTotal, e.totalUsd, true, fmt(l.costCalculatedOn, { date: isoToDMYDate(e.calculatedAt) }));
    if (e.stale) noteRow(sheet, row++, l.costStale, LAST_COL, { italic: true, color: { argb: C.peachD } });
  }

  // --- Index ---
  row++;
  sectionBar(sheet, row++, l.indexSection, LAST_COL);
  for (const [name, description] of indexEntries(opts)) {
    const a = sheet.getCell(row, 1);
    a.value = { text: name, hyperlink: `#'${name}'!A1` };
    applyLinkCellStyle(a, 'left');
    sheet.mergeCells(row, 2, row, LAST_COL);
    const b = sheet.getCell(row, 2);
    b.value = description;
    applyDataCellStyle(b, 'left');
    row++;
  }
}
