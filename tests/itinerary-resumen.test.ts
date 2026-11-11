import ExcelJS from 'exceljs';
import { buildItinerary, ItineraryOptions } from '../src/lib/itinerary-generator';
import { fixtureEstimate, fixtureTrip } from './helpers/itinerary-fixtures';

async function load(opts: ItineraryOptions) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildItinerary(opts) as unknown as ArrayBuffer);
  return wb;
}

function texts(sheet: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  sheet.eachRow(row => row.eachCell(cell => out.push(cell.text)));
  return out;
}

function links(sheet: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  sheet.eachRow(row => row.eachCell(cell => {
    const v = cell.value as { hyperlink?: string } | null;
    if (v && typeof v === 'object' && v.hyperlink) out.push(v.hyperlink);
  }));
  return out;
}

const ctx = (usdRate: number | null) => ({ weather: {}, usdRate, exportedAt: new Date('2026-11-10T12:00:00Z') });

describe('Resumen sheet + workbook shape', () => {
  it('has the 8 tabs in order (es-CL and en-US) and opens on the first', async () => {
    const es = await load({ trip: fixtureTrip() });
    expect(es.worksheets.map(w => w.name)).toEqual(['Resumen', 'Itinerario', 'Atracciones', 'Transporte', 'Hospedaje', 'Preparativos', 'Costos', 'Clima']);
    expect(es.views[0].activeTab).toBe(0);
    const en = await load({ trip: fixtureTrip(), locale: 'en-US' });
    expect(en.worksheets.map(w => w.name)).toEqual(['Summary', 'Itinerary', 'Attractions', 'Transport', 'Lodging', 'Preparations', 'Costs', 'Weather']);
  });

  it('shows dates, nights per city on the route, and travelers', async () => {
    const t = texts((await load({ trip: fixtureTrip() })).getWorksheet('Resumen')!).join(' | ');
    expect(t).toContain('12/03/2027 → 19/03/2027');
    expect(t).toContain('Santiago → Lima (4 noches) → Cusco (3 noches) → Santiago');
    expect(t).toContain('2 adultos');
  });

  it('links the published plan only when shareId and siteUrl exist', async () => {
    const shared = await load({ trip: fixtureTrip({ shareId: 'abc123' }), details: { siteUrl: 'https://tripilove.com' } });
    expect(links(shared.getWorksheet('Resumen')!)).toContain('https://tripilove.com/shared/abc123');
    const notShared = await load({ trip: fixtureTrip(), details: { siteUrl: 'https://tripilove.com' } });
    expect(links(notShared.getWorksheet('Resumen')!).some(l => l.includes('/shared/'))).toBe(false);
  });

  it('shows the cost block in USD and the viewer currency with the calculation date', async () => {
    const wb = await load({ trip: fixtureTrip({ costEstimate: fixtureEstimate() }), details: { currency: 'CLP' }, context: ctx(950) });
    const sheet = wb.getWorksheet('Resumen')!;
    const values: unknown[] = [];
    sheet.eachRow(row => row.eachCell(cell => values.push(cell.value)));
    for (const n of [1856, 900, 600, 106, 250, 1856 * 950]) expect(values).toContain(n);
    expect(texts(sheet).join(' ')).toContain('23/10/2026');
  });

  it('notes a stale estimate', async () => {
    const wb = await load({ trip: fixtureTrip({ costEstimate: fixtureEstimate({ stale: true }) }) });
    expect(texts(wb.getWorksheet('Resumen')!).join(' ')).toContain('Puede estar desactualizado');
  });

  it('never-calculated estimate → message and a link to my-trips', async () => {
    const wb = await load({ trip: fixtureTrip({ costEstimate: null }), details: { siteUrl: 'https://tripilove.com' } });
    const sheet = wb.getWorksheet('Resumen')!;
    expect(texts(sheet).join(' ')).toContain('Aún no calculamos el costo de este viaje');
    expect(links(sheet)).toContain('https://tripilove.com/my-trips');
  });

  it('index rows link to every other tab', async () => {
    const l = links((await load({ trip: fixtureTrip() })).getWorksheet('Resumen')!);
    for (const name of ['Itinerario', 'Atracciones', 'Transporte', 'Hospedaje', 'Preparativos', 'Costos', 'Clima']) {
      expect(l).toContain(`#'${name}'!A1`);
    }
  });

  it('writes no formulas anywhere', async () => {
    const wb = await load({ trip: fixtureTrip({ costEstimate: fixtureEstimate(), shareId: 's' }), details: { currency: 'CLP', siteUrl: 'https://tripilove.com' }, context: ctx(950) });
    wb.eachSheet(sheet => sheet.eachRow(row => row.eachCell(cell => expect(cell.formula).toBeUndefined())));
  });
});
