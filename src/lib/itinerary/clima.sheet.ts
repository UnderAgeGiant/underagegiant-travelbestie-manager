import ExcelJS from 'exceljs';
import { Trip } from '../../types';
import { ResolvedOptions } from './types';
import { weatherCodeLabel } from './labels';
import { C, applyDataCellStyle, fill, freezeHeader, titleStrip, writeHeaderRow } from './style';
import { dateKey, fmt, resolveCityName } from './util';
import { buildDayRange, stopIndexForDay } from './itinerario.sheet';

const LAST_COL = 6;

/** One row per trip day from the weather loaded at export time (§12 cache); never fetched here. */
export function buildClimaSheet(workbook: ExcelJS.Workbook, trip: Trip, opts: ResolvedOptions): void {
  const l = opts.labels;
  const sheet = workbook.addWorksheet(l.sheetClima);
  sheet.columns = [{ width: 12 }, { width: 14 }, { width: 26 }, { width: 10 }, { width: 10 }, { width: 34 }];
  titleStrip(sheet, l.climaTitle, fmt(l.weatherCalculatedOn, { date: dateKey(opts.context.exportedAt) }), LAST_COL);

  const days = buildDayRange(trip.stops).map(day => {
    const stopIdx = stopIndexForDay(day, trip.stops);
    const city = stopIdx === -1 ? '' : resolveCityName(trip.stops[stopIdx].cityId, l, opts.cityNames);
    const w = opts.context.weather[String(stopIdx)]?.find(d => d.date === day);
    return { day, city, w: w && w.type !== 'unavailable' ? w : undefined };
  });

  let headerRow = 3;
  if (days.some(d => d.w?.type === 'historic')) {
    sheet.mergeCells(3, 1, 3, LAST_COL);
    sheet.getRow(3).height = 30;
    const nudge = sheet.getCell(3, 1);
    nudge.value = l.weatherNudge;
    nudge.font = { bold: true, size: 10, color: { argb: C.peachD }, name: 'Calibri' };
    nudge.fill = fill(C.peach);
    nudge.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    headerRow = 4;
  }
  writeHeaderRow(sheet, headerRow, [l.hdrDay, l.hdrCity, l.hdrSky, l.hdrMax, l.hdrMin, l.hdrSource]);
  freezeHeader(sheet, headerRow);

  days.forEach(({ day, city, w }, i) => {
    const row = sheet.getRow(headerRow + 1 + i);
    const sky = w ? weatherCodeLabel(w.weatherCode, opts.locale) : undefined;
    const source = !w ? l.srcUnavailable : w.type === 'forecast' ? l.srcForecast : l.srcHistoric;
    const values: ExcelJS.CellValue[] = [
      day, city, sky ? `${sky.icon} ${sky.label}` : '',
      w?.tempMaxC !== undefined ? Math.round(w.tempMaxC) : null,
      w?.tempMinC !== undefined ? Math.round(w.tempMinC) : null,
      source,
    ];
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v;
      applyDataCellStyle(cell, c === 3 || c === 4 ? 'center' : 'left');
    });
    row.getCell(6).font = { ...row.getCell(6).font, color: { argb: C.t3 } };
  });
}
