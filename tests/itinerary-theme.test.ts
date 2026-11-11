import ExcelJS from 'exceljs';
import { inflateSync } from 'zlib';
import { buildItinerary } from '../src/lib/itinerary-generator';
import { LOGO_PNG_BASE64 } from '../src/lib/itinerary/itinerario.sheet';
import { fixtureTrip } from './helpers/itinerary-fixtures';

async function load(locale?: 'es-CL' | 'en-US') {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildItinerary({ trip: fixtureTrip(), locale }) as unknown as ArrayBuffer);
  return wb;
}
const argb = (c: ExcelJS.Cell) => (c.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;

describe('F78 owner follow-ups: site theme, logo, Preparativos', () => {
  it('title bars and header rows use site --lav with dark-violet bold text', async () => {
    const wb = await load();
    const iti = wb.getWorksheet('Itinerario')!;
    for (const c of [iti.getCell(1, 1), iti.getCell(1, 2)]) expect(argb(c)).toBe('FFD6D2FD');
    expect(iti.getCell(1, 2).font.color?.argb).toBe('FF4A348C');
    const res = wb.getWorksheet('Resumen')!.getCell(1, 1);
    expect(argb(res)).toBe('FFD6D2FD');
    expect(res.font.color?.argb).toBe('FF4A348C');
    const hdr = wb.getWorksheet('Transporte')!.getCell(1, 1);
    expect(argb(hdr)).toBe('FFD6D2FD');
    expect(hdr.font).toMatchObject({ bold: true, color: { argb: 'FF4A348C' } });
  });

  it('no white text anywhere', async () => {
    const wb = await load();
    wb.eachSheet(s => s.eachRow(r => r.eachCell(c => expect(c.font?.color?.argb).not.toBe('FFFFFFFF'))));
  });

  it('logo is a valid PNG whose IDAT inflates', () => {
    const png = Buffer.from(LOGO_PNG_BASE64, 'base64');
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(120);
    expect(png.readUInt32BE(20)).toBe(120);
    const idat: Buffer[] = [];
    for (let i = 8; i < png.length;) {
      const len = png.readUInt32BE(i);
      if (png.toString('ascii', i + 4, i + 8) === 'IDAT') idat.push(png.subarray(i + 8, i + 8 + len));
      i += 12 + len;
    }
    expect(() => inflateSync(Buffer.concat(idat))).not.toThrow();
  });

  it('"Antes de viajar" is now Preparativos / Preparations', async () => {
    expect((await load()).getWorksheet('Preparativos')!.getCell(1, 1).text).toBe('🧳 Preparativos');
    expect((await load('en-US')).getWorksheet('Preparations')!.getCell(1, 1).text).toBe('🧳 Preparations');
  });
});
