import ExcelJS from 'exceljs';
import { buildItinerary, ItineraryOptions } from '../src/lib/itinerary-generator';
import { fixtureTrip } from './helpers/itinerary-fixtures';
import { Trip } from '../src/types';

async function sheetOf(opts: ItineraryOptions, name = 'Atracciones') {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildItinerary(opts) as unknown as ArrayBuffer);
  return wb.getWorksheet(name)!;
}
const rowTexts = (sheet: ExcelJS.Worksheet, r: number) => Array.from({ length: 14 }, (_, i) => sheet.getCell(r, i + 1).text);

function tripWithPlans(): Trip {
  const trip = fixtureTrip();
  trip.stops[0].selectedAttractions = [
    { attractionId: 'lima_2', startTime: '15:00', endTime: '16:30', date: '14/03/2027' },
    { activityType: 'lunch', title: 'Almuerzo en Isolina', startTime: '13:00', endTime: '14:30', date: '13/03/2027', mapsUrl: 'https://maps.app.goo.gl/isolina' },
    { attractionId: 'lima_12', startTime: '10:00', endTime: null, date: '13/03/2027' },
    { attractionId: 'lima_5', startTime: '09:00', endTime: '10:00' }, // no date → stop check-in 12/03
  ];
  trip.stops[1].selectedAttractions = [
    { attractionId: 'cusco_1', startTime: '09:00', endTime: '12:00', date: '17/03/2027', ticketPurchased: true },
  ];
  return trip;
}

const details = {
  attractionDetails: {
    lima_12: { nativeName: 'Catedral de Lima', type: 'Iglesia', rating: 4.7, website: 'https://catedraldelima.org.pe/', ticketUrl: 'https://catedraldelima.org.pe/tickets', description: 'La iglesia mayor del Perú.' },
    cusco_1: { nativeName: 'Machu Picchu', type: 'Patrimonio', schedule: { wed: { open: '06:00', close: '17:30' } } },
  },
  personalLabels: { lunch: '🍽️ Almuerzo' },
};

describe('Atracciones sheet', () => {
  it('has the 14 headers in both languages, a frozen header row and an auto-filter', async () => {
    const es = await sheetOf({ trip: tripWithPlans() });
    expect(rowTexts(es, 1)).toEqual(['Día', 'Inicio', 'Fin', 'Ciudad', 'Atracción', 'Nombre local', 'Tipo', '⭐', 'Horario ese día', 'Entrada', 'Sitio web', 'Comprar entrada', 'Google Maps', 'Descripción']);
    expect(es.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect((es.views[0] as any).xSplit ?? 0).toBe(0);
    expect(es.autoFilter).toBeTruthy();
    const en = await sheetOf({ trip: tripWithPlans(), locale: 'en-US' }, 'Attractions');
    expect(rowTexts(en, 1)).toEqual(['Day', 'Start', 'End', 'City', 'Name', 'Local name', 'Type', '⭐', 'Hours that day', 'Ticket', 'Website', 'Buy ticket', 'Google Maps', 'Description']);
  });

  it('sorts by date then start time; an undated entry falls back to the stop check-in', async () => {
    const s = await sheetOf({ trip: tripWithPlans(), attractionNames: { lima_2: 'San Francisco', lima_12: 'Catedral', lima_5: 'Larco' } });
    const order = [2, 3, 4, 5, 6].map(r => [s.getCell(r, 1).text, s.getCell(r, 2).text, s.getCell(r, 5).text]);
    expect(order).toEqual([
      ['12/03/2027', '09:00', 'Larco'],
      ['13/03/2027', '10:00', 'Catedral'],
      ['13/03/2027', '13:00', 'Almuerzo en Isolina'],
      ['14/03/2027', '15:00', 'San Francisco'],
      ['17/03/2027', '09:00', expect.any(String)],
    ]);
  });

  it('shows the schedule for that weekday, blank without one', async () => {
    const s = await sheetOf({ trip: tripWithPlans(), details });
    expect(s.getCell(6, 9).text).toBe('06:00–17:30'); // 17/03/2027 is a Wednesday
    expect(s.getCell(3, 9).text).toBe('');
  });

  it('ticket column: needed / bought / none', async () => {
    const s = await sheetOf({ trip: tripWithPlans(), ticketRequiredIds: ['lima_12', 'cusco_1'], details });
    expect(s.getCell(3, 10).text).toBe('Necesita entrada');
    expect(s.getCell(6, 10).text).toBe('✅ Entrada comprada');
    expect(s.getCell(5, 10).text).toBe('No necesita');
  });

  it('catalog row carries local name, type, rating, links and description', async () => {
    const s = await sheetOf({ trip: tripWithPlans(), details, cityNames: { lima: 'Lima' } });
    expect(rowTexts(s, 3).slice(3, 8)).toEqual(['Lima', expect.any(String), 'Catedral de Lima', 'Iglesia', '4.7']);
    expect((s.getCell(3, 11).value as any).hyperlink).toBe('https://catedraldelima.org.pe/');
    expect((s.getCell(3, 12).value as any).hyperlink).toBe('https://catedraldelima.org.pe/tickets');
    expect((s.getCell(3, 13).value as any).hyperlink).toBe('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Catedral de Lima, Lima'));
    expect(s.getCell(3, 14).text).toBe('La iglesia mayor del Perú.');
  });

  it('personal activity: title, personal label, its own maps link, catalog columns blank', async () => {
    const s = await sheetOf({ trip: tripWithPlans(), details });
    const r = rowTexts(s, 4);
    expect(r[4]).toBe('Almuerzo en Isolina');
    expect(r[6]).toBe('🍽️ Almuerzo');
    expect((s.getCell(4, 13).value as any).hyperlink).toBe('https://maps.app.goo.gl/isolina');
    for (const c of [5, 7, 8, 9, 10, 11, 13]) expect(r[c]).toBe('');
    const noLabel = await sheetOf({ trip: tripWithPlans() });
    expect(noLabel.getCell(4, 7).text).toBe('lunch');
  });

  it('never shows a price', async () => {
    const s = await sheetOf({ trip: tripWithPlans(), details });
    s.eachRow(row => row.eachCell(cell => expect(cell.text).not.toMatch(/USD|\$|precio|price/i)));
  });
});
