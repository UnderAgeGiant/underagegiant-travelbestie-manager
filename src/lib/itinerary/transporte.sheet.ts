import ExcelJS from 'exceljs';
import { Trip } from '../../types';
import { ResolvedOptions } from './types';
import { modeLabel } from './labels';
import { applyDataCellStyle, applyLinkCellStyle, googleMapsSearchUrl, writeHeaderRow } from './style';
import { computeSegmentMinutes, formatDuration, resolveCityName } from './util';

export function buildTransporteSheet(workbook: ExcelJS.Workbook, trip: Trip, opts: ResolvedOptions): void {
  const l = opts.labels;
  const sheet = workbook.addWorksheet(l.sheetTransporte);
  sheet.columns = [
    { width: 26 }, { width: 14 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 18 }, { width: 14 },
  ];

  writeHeaderRow(sheet, 1, [l.hdrRoute, l.hdrDay, l.hdrDeparture, l.hdrArrival, l.hdrDuration, l.hdrMode, l.hdrCarrier, l.hdrLocation]);

  let rowNum = 2;
  for (const leg of trip.transits) {
    const fromCity = resolveCityName(leg.fromCityId, l, opts.cityNames);
    const toCity = resolveCityName(leg.toCityId, l, opts.cityNames);
    for (const seg of leg.segments) {
      const row = sheet.getRow(rowNum++);
      row.getCell(1).value = `${fromCity} - ${toCity}`;
      row.getCell(2).value = seg.departureDate;
      row.getCell(3).value = seg.departureTime;
      row.getCell(4).value = seg.arrivalTime;
      row.getCell(5).value = formatDuration(computeSegmentMinutes(seg));
      row.getCell(6).value = modeLabel(l, seg.mode);
      row.getCell(7).value = seg.carrier ?? '';
      if (seg.locationUrl || seg.carrier) {
        row.getCell(8).value = {
          text: seg.carrier ?? l.seeMap,
          hyperlink: seg.locationUrl ?? googleMapsSearchUrl(seg.carrier!),
        };
        applyLinkCellStyle(row.getCell(8));
      } else {
        applyDataCellStyle(row.getCell(8));
      }
      applyDataCellStyle(row.getCell(1), 'left');
      for (let c = 2; c <= 7; c++) applyDataCellStyle(row.getCell(c));
    }
  }
}
