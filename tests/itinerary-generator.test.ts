import ExcelJS from 'exceljs';
import { buildItinerary } from '../src/lib/itinerary-generator';
import { Trip } from '../src/types';

function baseTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1',
    title: 'Europe Test Trip',
    ownerId: 'user-1',
    createdAt: new Date().toISOString(),
    stops: [
      {
        cityId: 'paris',
        checkIn: '01/06/2026',
        checkOut: '03/06/2026',
        selectedAttractions: [
          { attractionId: 'paris_0', startTime: '10:00', endTime: null, date: '01/06/2026', ticketPurchased: false },
        ],
        lodging: { name: 'Hotel Rive Gauche', url: 'https://maps.app.goo.gl/hotel', address: '12 Rue de Rivoli', notes: 'Desayuno incluido' },
      },
    ],
    transits: [
      {
        fromCityId: 'london',
        toCityId: 'paris',
        segments: [
          {
            mode: 'flight',
            departureDate: '01/06/2026', departureTime: '07:00',
            arrivalDate: '01/06/2026', arrivalTime: '09:30',
            notes: 'LA 706', carrier: 'Latam', locationUrl: 'https://maps.app.goo.gl/airport',
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('buildItinerary — multi-sheet workbook', () => {
  it('produces exactly the Itinerario, Transporte, and Hospedaje sheets in order', async () => {
    const buffer = await buildItinerary({ trip: baseTrip() });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets.map(w => w.name)).toEqual(['Itinerario', 'Transporte', 'Hospedaje']);
  });

  it('Transporte sheet has the expected header and one row per segment', async () => {
    const buffer = await buildItinerary({
      trip: baseTrip(),
      cityNames: { london: 'Londres', paris: 'París' },
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Transporte')!;

    const header = sheet.getRow(1).values as unknown[];
    expect(header.slice(1)).toEqual(['Ruta', 'Día', 'Hora Salida', 'Hora Llegada', 'Duración', 'Tipo', 'Empresa', 'Ubicación']);

    const dataRow = sheet.getRow(2);
    expect(dataRow.getCell(1).value).toBe('Londres - París');
    expect(dataRow.getCell(2).value).toBe('01/06/2026');
    expect(dataRow.getCell(3).value).toBe('07:00');
    expect(dataRow.getCell(4).value).toBe('09:30');
    expect(dataRow.getCell(5).value).toBe('2h 30m');
    expect(dataRow.getCell(6).value).toBe('Vuelo');
    expect(dataRow.getCell(7).value).toBe('Latam');
    const locationCell = dataRow.getCell(8).value as { text: string; hyperlink: string };
    expect(locationCell.hyperlink).toBe('https://maps.app.goo.gl/airport');
    expect(locationCell.text).toBe('Ver mapa');
  });

  it('Hospedaje sheet has the expected header and one row per stop with lodging', async () => {
    const buffer = await buildItinerary({
      trip: baseTrip(),
      cityNames: { paris: 'París' },
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Hospedaje')!;

    const header = sheet.getRow(1).values as unknown[];
    expect(header.slice(1)).toEqual(['Ciudad', 'Día Llegada', 'Día Salida', 'Nombre', 'Noches', 'Dirección', 'Ubicación', 'Observaciones']);

    const dataRow = sheet.getRow(2);
    expect(dataRow.getCell(1).value).toBe('París');
    expect(dataRow.getCell(2).value).toBe('01/06/2026');
    expect(dataRow.getCell(3).value).toBe('03/06/2026');
    expect(dataRow.getCell(4).value).toBe('Hotel Rive Gauche');
    expect(dataRow.getCell(5).value).toBe(2);
    expect(dataRow.getCell(6).value).toBe('12 Rue de Rivoli');
    const locationCell = dataRow.getCell(7).value as { text: string; hyperlink: string };
    expect(locationCell.hyperlink).toBe('https://maps.app.goo.gl/hotel');
    expect(dataRow.getCell(8).value).toBe('Desayuno incluido');
  });

  it('Hospedaje sheet has no data rows when no stop has lodging', async () => {
    const trip = baseTrip();
    trip.stops[0].lodging = undefined;
    const buffer = await buildItinerary({ trip });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Hospedaje')!;
    expect(sheet.getRow(2).getCell(1).value).toBeNull();
  });
});

describe('buildItinerary — ticket status on the Itinerario sheet', () => {
  it('marks an attraction cell with a 🎟 prefix when a ticket is required but not purchased', async () => {
    const trip = baseTrip();
    const buffer = await buildItinerary({
      trip,
      ticketRequiredIds: ['paris_0'],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    // Attraction is at 10:00 → row 6 (00:00) + 10 = row 16, day column B (col 2)
    const cell = sheet.getCell(16, 2);
    expect(String(cell.value)).toContain('🎟️');
  });

  it('does not mark the cell when the ticket is already purchased', async () => {
    const trip = baseTrip();
    trip.stops[0].selectedAttractions[0].ticketPurchased = true;
    const buffer = await buildItinerary({
      trip,
      ticketRequiredIds: ['paris_0'],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    const cell = sheet.getCell(16, 2);
    expect(String(cell.value)).not.toContain('🎟️');
  });

  it('appends a 4-row colour legend below the hour grid', async () => {
    const buffer = await buildItinerary({ trip: baseTrip() });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    // Grid rows are 6..29 (24 hour rows); legend starts at row 31
    expect(sheet.getCell(31, 2).value).toBe('Necesita comprar entrada');
    expect(sheet.getCell(32, 2).value).toBe('Atracción');
    expect(sheet.getCell(33, 2).value).toBe('Transporte');
    expect(sheet.getCell(34, 2).value).toBe('Atracciones superpuestas (ver comentario en la celda)');
  });
});

describe('buildItinerary — full 24-hour grid', () => {
  it('labels the first grid row 00:00', async () => {
    const buffer = await buildItinerary({ trip: baseTrip() });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    expect(sheet.getCell(6, 1).value).toBe('00:00');
    expect(sheet.getCell(29, 1).value).toBe('23:00');
  });

  it('places a transit arrival that crosses midnight in the correct day column and hour', async () => {
    const trip = baseTrip();
    trip.transits.push({
      fromCityId: 'paris',
      toCityId: 'rome',
      segments: [{
        mode: 'train',
        departureDate: '02/06/2026', departureTime: '23:30',
        arrivalDate: '03/06/2026', arrivalTime: '01:15',
        notes: '',
      }],
    });
    const buffer = await buildItinerary({ trip });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    // 03/06/2026 is day index 2 → column 4 (dayIdx + 2); 01:15 → hour 1 → row 7
    const cell = sheet.getCell(7, 4);
    expect(String(cell.value)).toContain('Llega Tren');
  });
});

describe('buildItinerary — multi-hour attraction blocks', () => {
  it('merges cells for an attraction spanning multiple hours', async () => {
    const trip = baseTrip();
    trip.stops[0].selectedAttractions[0] = {
      attractionId: 'paris_0', startTime: '10:00', endTime: '13:00', date: '01/06/2026',
    };
    const buffer = await buildItinerary({ trip });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    // 10:00 → row 16 (6 + 10); 13:00 end → last covered row is 18 (12:00's row)
    expect(sheet.model.merges).toContain('B16:B18');
    expect(String(sheet.getCell(16, 2).value)).toContain('10:00');
  });

  it('does not merge over an hour already occupied by a transit event', async () => {
    const trip = baseTrip();
    trip.stops[0].selectedAttractions[0] = {
      attractionId: 'paris_0', startTime: '10:00', endTime: '13:00', date: '01/06/2026',
    };
    trip.transits.push({
      fromCityId: 'paris',
      toCityId: 'rome',
      segments: [{ mode: 'train', departureDate: '01/06/2026', departureTime: '11:00', arrivalDate: '01/06/2026', arrivalTime: '11:05', notes: '' }],
    });
    const buffer = await buildItinerary({ trip });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    expect(sheet.model.merges.some(m => m.startsWith('B16'))).toBe(false);
    // hour 11 (row 17) keeps the transit text — not swallowed by the attraction block
    expect(String(sheet.getCell(17, 2).value)).toContain('Sale Tren');
  });

  it('does not merge a single-hour attraction (no endTime)', async () => {
    const buffer = await buildItinerary({ trip: baseTrip() }); // endTime: null in the fixture
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    expect(sheet.model.merges.some(m => m.startsWith('B16'))).toBe(false);
  });

  it('flags two overlapping attractions with a warning cell and a comment listing each timeframe', async () => {
    const trip = baseTrip();
    trip.stops[0].selectedAttractions = [
      { attractionId: 'paris_0', startTime: '10:00', endTime: '13:00', date: '01/06/2026' },
      { attractionId: 'paris_1', startTime: '11:00', endTime: '12:00', date: '01/06/2026' },
    ];
    const buffer = await buildItinerary({ trip });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    const cell = sheet.getCell(16, 2); // earliest start (10:00) → row 16
    expect(String(cell.value)).toContain('⚠️');
    expect(String(cell.value)).toContain('2 atracciones');
    expect(String(cell.note)).toContain('10:00–13:00');
    expect(String(cell.note)).toContain('11:00–12:00');
    expect(sheet.model.merges.some(m => m.startsWith('B16'))).toBe(false);
    // The second attraction's own start hour (11:00 → row 17) is folded into
    // the warning cell above, not rendered as a separate block of its own.
    expect(sheet.getCell(17, 2).value).toBeNull();
  });

  it('does not flag two attractions that only share an hour with no real overlap in a 3-way cluster edge case', async () => {
    // Sanity check: a lone attraction next to (not overlapping) a conflict
    // cluster on the same day still renders as its own normal solo block.
    const trip = baseTrip();
    trip.stops[0].selectedAttractions = [
      { attractionId: 'paris_0', startTime: '10:00', endTime: '13:00', date: '01/06/2026' },
      { attractionId: 'paris_1', startTime: '11:00', endTime: '12:00', date: '01/06/2026' },
      { attractionId: 'paris_2', startTime: '15:00', endTime: null, date: '01/06/2026' },
    ];
    const buffer = await buildItinerary({ trip });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    // 15:00 → row 21; unrelated to the 10:00-13:00 conflict cluster above
    expect(String(sheet.getCell(21, 2).value)).not.toContain('⚠️');
    expect(String(sheet.getCell(21, 2).value)).toContain('15:00');
  });
});
