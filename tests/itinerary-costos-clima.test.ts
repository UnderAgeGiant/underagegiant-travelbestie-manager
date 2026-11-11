import ExcelJS from 'exceljs';
import { buildItinerary, ItineraryOptions } from '../src/lib/itinerary-generator';
import { fixtureEstimate, fixtureTrip } from './helpers/itinerary-fixtures';
import { WeatherResponseDay } from '../src/types';

async function sheetOf(opts: ItineraryOptions, name: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildItinerary(opts) as unknown as ArrayBuffer);
  return wb.getWorksheet(name)!;
}
function cells(sheet: ExcelJS.Worksheet): ExcelJS.Cell[] {
  const out: ExcelJS.Cell[] = [];
  sheet.eachRow(row => row.eachCell(c => out.push(c)));
  return out;
}
const allText = (s: ExcelJS.Worksheet) => cells(s).map(c => c.text).join(' | ');
function rowWith(sheet: ExcelJS.Worksheet, label: string): ExcelJS.Row {
  let found: ExcelJS.Row | undefined;
  sheet.eachRow(row => { if (!found && row.getCell(1).text.includes(label)) found = row; });
  if (!found) throw new Error(`no row starting with ${label}`);
  return found;
}
const ctx = (usdRate: number | null, weather: Record<string, WeatherResponseDay[]> = {}) =>
  ({ weather, usdRate, exportedAt: new Date('2026-11-10T12:00:00Z') });

const estimate = fixtureEstimate({ settings: { adults: 2, children: 1, infants: 1, comfort: 'mid', origin: null } });

describe('Costos sheet', () => {
  it('lists the 4 categories, total and per person (infants excluded)', async () => {
    const s = await sheetOf({ trip: fixtureTrip({ costEstimate: estimate }) }, 'Costos');
    for (const label of ['Vuelos', 'Hospedaje', 'Entradas', 'Transporte terrestre']) expect(rowWith(s, label)).toBeTruthy();
    expect(rowWith(s, 'TOTAL').getCell(2).value).toBe(1856);
    expect(rowWith(s, 'Por persona').getCell(2).value).toBe(619);
  });

  it('adds a viewer-currency column only when a rate exists', async () => {
    const withRate = await sheetOf({ trip: fixtureTrip({ costEstimate: estimate }), details: { currency: 'CLP' }, context: ctx(950) }, 'Costos');
    expect(rowWith(withRate, 'TOTAL').getCell(3).value).toBe(1856 * 950);
    expect(allText(withRate)).toContain('CLP');
    const noRate = await sheetOf({ trip: fixtureTrip({ costEstimate: estimate }), details: { currency: 'CLP' }, context: ctx(null) }, 'Costos');
    expect(typeof rowWith(noRate, 'TOTAL').getCell(3).value).not.toBe('number');
    expect(allText(noRate)).not.toContain('CLP');
  });

  it('notes nights/rooms on lodging and unpriced tickets', async () => {
    const s = await sheetOf({ trip: fixtureTrip({ costEstimate: estimate }) }, 'Costos');
    const lodging = rowWith(s, 'Hospedaje');
    const lodgingNote = lodging.getCell(lodging.cellCount).text;
    expect(lodgingNote).toContain('7 noches');
    expect(lodgingNote).toContain('1 habitación');
    const tickets = rowWith(s, 'Entradas');
    expect(tickets.getCell(tickets.cellCount).text).toContain('1 sin precio');
  });

  it('shows missing origin, unestimated legs and the stale note', async () => {
    const e = fixtureEstimate({ missingOrigin: true, stale: true, unestimated: [{ from: 'lima', to: 'cusco', mode: 'bus' }] });
    const t = allText(await sheetOf({ trip: fixtureTrip({ costEstimate: e }) }, 'Costos'));
    expect(t).toContain('No incluye vuelos desde tu ciudad');
    expect(t).toContain('Lima → Cusco · Bus · sin estimar');
    expect(t).toContain('Puede estar desactualizado');
  });

  it('never calculated → only the message (+ link with siteUrl)', async () => {
    const s = await sheetOf({ trip: fixtureTrip({ costEstimate: null }), details: { siteUrl: 'https://tripilove.com' } }, 'Costos');
    const t = allText(s);
    expect(t).toContain('Aún no calculamos el costo de este viaje');
    expect(t).not.toContain('TOTAL');
    expect(cells(s).some(c => (c.value as any)?.hyperlink === 'https://tripilove.com/my-trips')).toBe(true);
  });
});

describe('Clima sheet', () => {
  const lima: WeatherResponseDay[] = [
    { date: '12/03/2027', type: 'forecast', tempMaxC: 27.4, tempMinC: 20.1, weatherCode: 0 },
    { date: '13/03/2027', type: 'historic', tempMaxC: 26, tempMinC: 19, weatherCode: 61 },
    { date: '14/03/2027', type: 'unavailable' },
    { date: '15/03/2027', type: 'forecast', tempMaxC: 25, tempMinC: 18, weatherCode: 3 },
    { date: '16/03/2027', type: 'forecast', tempMaxC: 25, tempMinC: 18, weatherCode: 3 },
  ];

  it('one row per trip day with sky, temperatures and source', async () => {
    const s = await sheetOf({ trip: fixtureTrip(), context: ctx(null, { '0': lima }) }, 'Clima');
    const dates: string[] = [];
    s.eachRow(row => { if (/^\d{2}\/\d{2}\/\d{4}$/.test(row.getCell(1).text)) dates.push(row.getCell(1).text); });
    expect(dates).toEqual(['12/03/2027', '13/03/2027', '14/03/2027', '15/03/2027', '16/03/2027', '17/03/2027', '18/03/2027', '19/03/2027']);
    const first = rowWith(s, '12/03/2027');
    expect(first.getCell(3).text).toContain('☀️');
    expect(first.getCell(4).value).toBe(27);
    expect(first.getCell(6).text).toBe('Pronóstico');
    expect(rowWith(s, '13/03/2027').getCell(6).text).toBe('Estimado (mismo día del año pasado)');
    expect(rowWith(s, '14/03/2027').getCell(6).text).toBe('No disponible');
  });

  it('title says when the weather was calculated; nudge only when a day is historic', async () => {
    const withHistoric = allText(await sheetOf({ trip: fixtureTrip(), context: ctx(null, { '0': lima }) }, 'Clima'));
    expect(withHistoric).toContain('Clima calculado el 10/11/2026');
    expect(withHistoric).toContain('Descárgalo de nuevo');
    const forecastOnly = allText(await sheetOf({ trip: fixtureTrip(), context: ctx(null, { '0': [lima[0]] }) }, 'Clima'));
    expect(forecastOnly).not.toContain('Descárgalo de nuevo');
  });

  it('no weather at all → every day reads "No disponible"', async () => {
    const s = await sheetOf({ trip: fixtureTrip() }, 'Clima');
    let days = 0;
    s.eachRow(row => {
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(row.getCell(1).text)) return;
      days++;
      expect(row.getCell(6).text).toBe('No disponible');
    });
    expect(days).toBe(8);
  });
});

describe('calculated-on dates use Chile time, not UTC (review F-1)', () => {
  // 00:15 UTC on 11/11 is 21:15 on 10/11 in Santiago.
  const lateEvening = '2026-11-11T00:15:00Z';
  it('Clima title', async () => {
    const s = await sheetOf({ trip: fixtureTrip(), context: { weather: {}, usdRate: null, exportedAt: new Date(lateEvening) } }, 'Clima');
    expect(allText(s)).toContain('Clima calculado el 10/11/2026');
  });
  it('Resumen and Costos estimate date', async () => {
    const trip = fixtureTrip({ costEstimate: fixtureEstimate({ calculatedAt: lateEvening }) });
    expect(allText(await sheetOf({ trip }, 'Resumen'))).toContain('10/11/2026');
    expect(allText(await sheetOf({ trip }, 'Resumen'))).not.toContain('11/11/2026');
    expect(allText(await sheetOf({ trip }, 'Costos'))).toContain('10/11/2026');
  });
});
