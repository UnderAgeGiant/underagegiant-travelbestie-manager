import ExcelJS from 'exceljs';
import { Trip } from '../../types';
import { ResolvedOptions } from './types';
import { applyDataCellStyle, applyLinkCellStyle, googleMapsSearchUrl, writeHeaderRow } from './style';
import { nightsBetween, resolveCityName } from './util';

export function buildHospedajeSheet(workbook: ExcelJS.Workbook, trip: Trip, opts: ResolvedOptions): void {
  const l = opts.labels;
  const sheet = workbook.addWorksheet(l.sheetHospedaje);
  sheet.columns = [
    { width: 16 }, { width: 14 }, { width: 14 }, { width: 24 },
    { width: 10 }, { width: 28 }, { width: 14 }, { width: 34 },
  ];

  writeHeaderRow(sheet, 1, [l.hdrCity, l.hdrCheckIn, l.hdrCheckOut, l.hdrName, l.hdrNights, l.hdrAddress, l.hdrLocation, l.hdrLodgingNotes]);

  let rowNum = 2;
  for (const stop of trip.stops) {
    if (!stop.lodging) continue;
    const row = sheet.getRow(rowNum++);
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
