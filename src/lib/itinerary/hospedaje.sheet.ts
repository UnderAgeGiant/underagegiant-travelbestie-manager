import ExcelJS from 'exceljs';
import { Trip } from '../../types';
import { ResolvedOptions } from './types';
import { C, USD_FMT, applyDataCellStyle, applyLinkCellStyle, freezeHeader, googleMapsSearchUrl, writeHeaderRow } from './style';
import { nightsBetween, resolveCityName } from './util';

export function buildHospedajeSheet(workbook: ExcelJS.Workbook, trip: Trip, opts: ResolvedOptions): void {
  const l = opts.labels;
  const sheet = workbook.addWorksheet(l.sheetHospedaje);
  sheet.columns = [
    { width: 16 }, { width: 14 }, { width: 14 }, { width: 24 },
    { width: 10 }, { width: 28 }, { width: 14 }, { width: 34 }, { width: 16 },
  ];
  // Average per night from the stored estimate (Manager's call) — only when one exists.
  const e = trip.costEstimate;
  const avgPerNight = e && e.nights > 0 ? Math.round(e.lodgingUsd / e.nights) : null;

  writeHeaderRow(sheet, 1, [l.hdrCity, l.hdrCheckIn, l.hdrCheckOut, l.hdrName, l.hdrNights, l.hdrAddress, l.hdrLocation, l.hdrLodgingNotes, ...(avgPerNight !== null ? [l.lodgingAvgPerNight] : [])]);
  freezeHeader(sheet, 1);

  let rowNum = 2;
  for (const stop of trip.stops) {
    const row = sheet.getRow(rowNum++);
    if (avgPerNight !== null) {
      row.getCell(9).value = avgPerNight;
      row.getCell(9).numFmt = USD_FMT;
      applyDataCellStyle(row.getCell(9));
    }
    if (!stop.lodging) {
      // Keep the gap visible: city, dates and nights with a "no lodging" marker.
      row.getCell(1).value = resolveCityName(stop.cityId, l, opts.cityNames);
      row.getCell(2).value = stop.checkIn;
      row.getCell(3).value = stop.checkOut;
      row.getCell(4).value = l.lodgingMissing;
      row.getCell(5).value = nightsBetween(stop.checkIn, stop.checkOut);
      for (let c = 1; c <= 8; c++) applyDataCellStyle(row.getCell(c), c === 4 ? 'left' : 'center');
      row.getCell(4).font = { ...row.getCell(4).font, italic: true, color: { argb: C.t3 } };
      continue;
    }
    row.getCell(1).value = resolveCityName(stop.cityId, l, opts.cityNames);
    row.getCell(2).value = stop.checkIn;
    row.getCell(3).value = stop.checkOut;
    row.getCell(4).value = stop.lodging.name;
    row.getCell(5).value = nightsBetween(stop.checkIn, stop.checkOut);
    row.getCell(6).value = stop.lodging.address ?? '';
    row.getCell(7).value = {
      text: stop.lodging.name,
      hyperlink: stop.lodging.url || googleMapsSearchUrl(stop.lodging.name),
    };
    applyLinkCellStyle(row.getCell(7));
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
