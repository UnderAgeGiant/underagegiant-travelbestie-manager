import ExcelJS from 'exceljs';

// Brand palette — derived from frontend styles.css (oklch tokens) and favicon.svg
export const C = {
  lavD:   'FF7C3AED',  // --lav-d  oklch(55% .16 290)
  peachD: 'FFEA580C',  // --peach-d oklch(62% .15 50)
  lav:    'FFEDE9FE',  // --lav    oklch(88% .06 290)
  peach:  'FFFDE8D8',  // --peach  oklch(91% .07 50)
  mint:   'FFD1FAE5',  // --mint   oklch(91% .07 160)
  butter: 'FFFEF3C7',  // personal activities (F78)
  cream:  'FFF9F8F4',  // --cream  oklch(98% .01 80)
  white:  'FFFFFFFF',
  t1:     'FF1E1B4B',  // --t1     oklch(18% .02 270)
  t2:     'FF4B5180',  // --t2     oklch(42% .03 270)
  t3:     'FF9CA3AF',  // --t3     oklch(65% .02 270)
  border: 'FFE2E3EC',  // --border oklch(88% .015 270)
} as const;

export function border(): Partial<ExcelJS.Borders> {
  const side: ExcelJS.Border = { style: 'thin', color: { argb: C.border } };
  return { top: side, bottom: side, left: side, right: side };
}

export function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

export function applyHeaderStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 11, color: { argb: C.white }, name: 'Calibri' };
  cell.fill = fill(C.lavD);
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = border();
}

export function applyCityStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 10, color: { argb: C.lavD }, name: 'Calibri' };
  cell.fill = fill(C.lav);
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = border();
}

export function applyTimeSlotStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 10, color: { argb: C.t1 }, name: 'Calibri' };
  cell.fill = fill(C.cream);
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = border();
}

export type ActivityStyle = 'transit' | 'attraction' | 'ticket' | 'conflict' | 'personal' | 'empty';

export function applyActivityStyle(cell: ExcelJS.Cell, type: ActivityStyle): void {
  const fgColor =
    type === 'transit'    ? C.lav :
    type === 'ticket'     ? C.peach :
    type === 'conflict'   ? C.peachD :
    type === 'attraction' ? C.mint :
    type === 'personal'   ? C.butter :
    C.white;
  const textColor = type === 'conflict' ? C.white : C.t1;
  cell.fill = fill(fgColor);
  cell.font = { size: 10, bold: type === 'conflict', color: { argb: textColor }, name: 'Calibri' };
  cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  cell.border = border();
}

export function applyDataCellStyle(cell: ExcelJS.Cell, align: 'left' | 'center' | 'right' = 'center'): void {
  cell.font = { size: 10, color: { argb: C.t1 }, name: 'Calibri' };
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true };
  cell.border = border();
}

export function applyLinkCellStyle(cell: ExcelJS.Cell, align: 'left' | 'center' = 'center'): void {
  cell.font = { size: 10, color: { argb: C.lavD }, name: 'Calibri', underline: true };
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true };
  cell.border = border();
}

export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Freezes the first `rows` rows (and `cols` columns — only Itinerario uses that). */
export function freezeHeader(sheet: ExcelJS.Worksheet, rows: number, cols = 0): void {
  sheet.views = [{ state: 'frozen', xSplit: cols, ySplit: rows }];
}

/** Header row of a plain table sheet (Transporte, Hospedaje, Atracciones…). */
export function writeHeaderRow(sheet: ExcelJS.Worksheet, rowNum: number, headers: string[]): void {
  const row = sheet.getRow(rowNum);
  row.height = 30;
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    applyHeaderStyle(cell);
  });
}
