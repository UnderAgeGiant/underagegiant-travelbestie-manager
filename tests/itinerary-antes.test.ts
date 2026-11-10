import ExcelJS from 'exceljs';
import { buildItinerary, ItineraryOptions } from '../src/lib/itinerary-generator';
import { fixtureEstimate, fixtureTrip } from './helpers/itinerary-fixtures';
import { Trip } from '../src/types';

async function sheetOf(opts: ItineraryOptions, name: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildItinerary(opts) as unknown as ArrayBuffer);
  return wb.getWorksheet(name)!;
}
function lines(sheet: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  sheet.eachRow(row => out.push(row.getCell(1).text + (row.getCell(2).text && row.getCell(2).text !== row.getCell(1).text ? ' ' + row.getCell(2).text : '')));
  return out;
}

function trip(): Trip {
  const t = fixtureTrip();
  t.stops[0].selectedAttractions = [
    { attractionId: 'lima_12', startTime: '10:00', endTime: null, date: '13/03/2027' },
    { attractionId: 'lima_3', startTime: '10:00', endTime: null, date: '14/03/2027', ticketPurchased: true },
    { attractionId: 'lima_4', startTime: '12:00', endTime: null, date: '14/03/2027' },          // no ticket needed
    { activityType: 'lunch', title: 'Almuerzo', startTime: '13:00', endTime: '14:00', date: '13/03/2027' },
  ];
  t.stops[1].lodging = { name: 'Hotel Cusco', url: '' };
  t.transits = [{ fromCityId: 'lima', toCityId: 'cusco', segments: [
    { mode: 'bus', departureDate: '16/03/2027', departureTime: '07:00', arrivalDate: '17/03/2027', arrivalTime: '05:00', notes: 'Llegar 30 min antes' },
  ] }];
  return t;
}

const base: Partial<ItineraryOptions> = {
  cityNames: { lima: 'Lima', cusco: 'Cusco' },
  attractionNames: { lima_12: 'Catedral de Lima', lima_3: 'Museo Larco', lima_4: 'Parque' },
  ticketRequiredIds: ['lima_12', 'lima_3'],
};

describe('Antes de viajar sheet', () => {
  it('one block per destination; missing facts and time rows are omitted', async () => {
    const s = await sheetOf({ ...base, trip: trip(), details: { destinations: [
      { country: 'Perú', flag: '🇵🇪', visa: 'Sin visa · 183 días', currency: 'Sol peruano (S/)', plug: 'Tipo A, C · 220 V',
        cities: [{ name: 'Lima', timeDiff: '2 h menos' }, { name: 'Cusco' }] },
      { country: 'Bolivia', currency: 'Boliviano (Bs)', cities: [{ name: 'La Paz' }] },
    ] } }, 'Antes de viajar');
    const t = lines(s).join('\n');
    expect(t).toContain('🇵🇪 Perú — Lima, Cusco');
    expect(t).toContain('🛂 Visa Sin visa · 183 días');
    expect(t).toContain('🪙 Moneda Sol peruano (S/)');
    expect(t).toContain('🔌 Enchufe Tipo A, C · 220 V');
    expect(t).toContain('🕐 Hora Lima: 2 h menos');
    expect(t).not.toContain('Cusco: ');
    const bolivia = t.slice(t.indexOf('Bolivia'));
    expect(bolivia).toContain('🪙 Moneda Boliviano (Bs)');
    expect(bolivia).not.toContain('🛂 Visa');
    expect(bolivia).not.toContain('🕐 Hora');
  });

  it('checklist: unbought tickets (with buy link), bought ones ticked, missing lodging, transport legs', async () => {
    const s = await sheetOf({ ...base, trip: trip(), details: {
      attractionDetails: { lima_12: { ticketUrl: 'https://catedraldelima.org.pe/tickets' } },
    } }, 'Antes de viajar');
    const t = lines(s);
    expect(t).toContain('☐ Comprar entrada: Catedral de Lima (13/03)');
    expect(t).toContain('☑ Entrada Museo Larco (14/03)');
    expect(t.join('\n')).not.toContain('Parque');
    expect(t).toContain('☐ Reservar hospedaje en Lima');
    expect(t.join('\n')).not.toContain('hospedaje en Cusco');
    expect(t).toContain('☐ Transporte: Lima → Cusco (16/03 07:00)');
    let buyLink: string | undefined;
    s.eachRow(row => { const v = row.getCell(3).value as any; if (v?.hyperlink) buyLink = v.hyperlink; });
    expect(buyLink).toBe('https://catedraldelima.org.pe/tickets');
  });

  it('no destinations → no country blocks but the checklist stays', async () => {
    const t = lines(await sheetOf({ ...base, trip: trip() }, 'Antes de viajar')).join('\n');
    expect(t).not.toContain('🛂');
    expect(t).toContain('✅ Checklist');
    expect(t).toContain('☐ Reservar hospedaje en Lima');
  });
});

describe('Transporte + Hospedaje additions', () => {
  it('Transporte has a frozen header and segment notes', async () => {
    const s = await sheetOf({ ...base, trip: trip() }, 'Transporte');
    expect(s.getCell(1, 9).text).toBe('Notas');
    expect(s.getCell(2, 9).text).toBe('Llegar 30 min antes');
    expect(s.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });

  it('Hospedaje: missing-lodging row, frozen header, avg per night only with an estimate', async () => {
    const withEst = await sheetOf({ ...base, trip: { ...trip(), costEstimate: fixtureEstimate() } }, 'Hospedaje');
    expect(withEst.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(withEst.getCell(2, 4).text).toBe('Sin hospedaje registrado');
    expect(withEst.getCell(1, 9).text).toBe('Promedio estimado/noche');
    expect(withEst.getCell(3, 9).value).toBe(Math.round(600 / 7));
    const noEst = await sheetOf({ ...base, trip: trip() }, 'Hospedaje');
    expect(noEst.getCell(1, 9).value).toBeNull();
  });
});
