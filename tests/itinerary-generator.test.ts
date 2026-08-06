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
    expect(locationCell.text).toBe('Latam');
  });

  it('Transporte falls back to a Google Maps search link built from the carrier name when locationUrl is absent', async () => {
    const trip = baseTrip();
    trip.transits[0].segments[0].locationUrl = undefined;
    const buffer = await buildItinerary({ trip });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Transporte')!;
    const locationCell = sheet.getRow(2).getCell(8).value as { text: string; hyperlink: string };
    expect(locationCell.text).toBe('Latam');
    expect(locationCell.hyperlink).toBe('https://www.google.com/maps/search/?api=1&query=Latam');
  });

  it('Transporte leaves Ubicación blank when neither locationUrl nor carrier is set', async () => {
    const trip = baseTrip();
    trip.transits[0].segments[0].locationUrl = undefined;
    trip.transits[0].segments[0].carrier = undefined;
    const buffer = await buildItinerary({ trip });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Transporte')!;
    expect(sheet.getRow(2).getCell(8).value).toBeNull();
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
    expect(locationCell.text).toBe('Hotel Rive Gauche');
    expect(dataRow.getCell(8).value).toBe('Desayuno incluido');
  });

  it('Hospedaje falls back to a Google Maps search link built from the lodging name when url is absent', async () => {
    const trip = baseTrip();
    trip.stops[0].lodging!.url = '';
    const buffer = await buildItinerary({ trip });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Hospedaje')!;
    const locationCell = sheet.getRow(2).getCell(7).value as { text: string; hyperlink: string };
    expect(locationCell.text).toBe('Hotel Rive Gauche');
    expect(locationCell.hyperlink).toBe('https://www.google.com/maps/search/?api=1&query=Hotel%20Rive%20Gauche');
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

  it('splits a transit segment that crosses midnight into two merged blocks — departure-to-midnight and midnight-to-arrival', async () => {
    const trip = baseTrip();
    trip.transits.push({
      fromCityId: 'paris',
      toCityId: 'rome',
      segments: [{
        mode: 'train',
        departureDate: '02/06/2026', departureTime: '20:00',
        arrivalDate: '03/06/2026', arrivalTime: '02:00',
        notes: '',
      }],
    });
    const buffer = await buildItinerary({ trip });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;

    // 02/06/2026 is day index 1 → column 3; 20:00 → row 26 (6 + 20); merges to row 29 (23:00)
    expect(sheet.model.merges).toContain('C26:C29');
    expect(String(sheet.getCell(26, 3).value)).toContain('Sale Tren');

    // 03/06/2026 is day index 2 → column 4; block starts at 00:00 → row 6, merges to row 8 (02:00)
    expect(sheet.model.merges).toContain('D6:D8');
    expect(String(sheet.getCell(6, 4).value)).toContain('Llega Tren');
  });

  it('attaches an attraction whose own start hour falls inside an overnight transit block instead of corrupting the merge', async () => {
    const trip = baseTrip();
    // Move the fixture's attraction to 16:00 on 01/06/2026, then add an
    // overnight departure that swallows that same hour on the same day.
    trip.stops[0].selectedAttractions[0].startTime = '16:00';
    trip.transits.push({
      fromCityId: 'paris',
      toCityId: 'rome',
      segments: [{
        mode: 'flight',
        departureDate: '01/06/2026', departureTime: '14:00',
        arrivalDate: '02/06/2026', arrivalTime: '03:00',
        notes: '',
      }],
    });
    const buffer = await buildItinerary({ trip });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;

    // Departure block on 01/06/2026 (dayIdx 0, col B): 14:00 → 23:00 → rows 20-29.
    expect(sheet.model.merges).toContain('B20:B29');
    const masterCell = sheet.getCell(20, 2);
    expect(String(masterCell.value)).toContain('Sale Vuelo');
    // The attraction that would have started at 16:00 (inside the merged range)
    // is folded into the same cell instead of overwriting it.
    expect(String(masterCell.value)).toContain('16:00');
    expect(String(masterCell.value)).toContain('Attraction 1');

    // No independent block/merge was created at the attraction's own start hour.
    expect(sheet.model.merges.some(m => m.startsWith('B22'))).toBe(false);
  });

  it('keeps a same-day transit segment as separate single-hour markers (no merge)', async () => {
    const buffer = await buildItinerary({ trip: baseTrip() });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    // london → paris, same day, 07:00–09:30 → rows 13 and 15, column 2 (dayIdx 0)
    expect(sheet.model.merges.some(m => m.startsWith('B13') || m.startsWith('B15'))).toBe(false);
    expect(String(sheet.getCell(13, 2).value)).toContain('Sale Vuelo');
    expect(String(sheet.getCell(15, 2).value)).toContain('Llega Vuelo');
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

  it('includes a colliding flight\'s full departure–arrival range in the conflict comment', async () => {
    const trip = baseTrip();
    trip.stops[0].selectedAttractions = [
      { attractionId: 'paris_0', startTime: '10:00', endTime: '13:00', date: '01/06/2026' },
      { attractionId: 'paris_1', startTime: '11:00', endTime: '12:00', date: '01/06/2026' },
    ];
    // A same-day flight departing exactly at the conflict cell's start hour
    // stacks its text into that cell — the comment should explain it too.
    trip.transits.push({
      fromCityId: 'london',
      toCityId: 'paris',
      segments: [{
        mode: 'flight',
        departureDate: '01/06/2026', departureTime: '10:00',
        arrivalDate: '01/06/2026', arrivalTime: '10:45',
        notes: '',
      }],
    });
    const buffer = await buildItinerary({ trip });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    const cell = sheet.getCell(16, 2); // earliest start (10:00) → row 16
    expect(String(cell.value)).toContain('⚠️');
    expect(String(cell.note)).toContain('10:00–13:00');
    expect(String(cell.note)).toContain('11:00–12:00');
    expect(String(cell.note)).toContain('10:00–10:45');
    expect(String(cell.note)).toContain('Vuelo');
  });

  it('uses the estimated visit duration as the end time in the conflict comment when endTime is absent', async () => {
    const trip = baseTrip();
    trip.stops[0].selectedAttractions = [
      { attractionId: 'paris_0', startTime: '10:00', endTime: null, date: '01/06/2026' },
      { attractionId: 'paris_1', startTime: '10:30', endTime: '11:30', date: '01/06/2026' },
    ];
    const buffer = await buildItinerary({
      trip,
      attractionDurations: { paris_0: 90 }, // no endTime → falls back to 10:00 + 90min = 11:30
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    const cell = sheet.getCell(16, 2); // earliest start (10:00) → row 16
    expect(String(cell.value)).toContain('⚠️');
    expect(String(cell.note)).toContain('10:00–11:30');
    expect(String(cell.note)).toContain('10:30–11:30');
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

describe('buildItinerary — default block duration from attractionDurations', () => {
  it('uses attractionDurations minutes for the default block when endTime is absent', async () => {
    const trip = baseTrip();
    trip.stops[0].selectedAttractions[0] = {
      attractionId: 'paris_0', startTime: '10:00', endTime: null, date: '01/06/2026',
    };
    const buffer = await buildItinerary({
      trip,
      attractionDurations: { paris_0: 150 }, // 2h30 → covers 10:00, 11:00, 12:00
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    // 10:00 → row 16 (6 + 10); 150 min → last covered row is 18 (12:00's row)
    expect(sheet.model.merges).toContain('B16:B18');
  });

  it('falls back to a flat 1-hour block when attractionDurations has no entry for the attraction', async () => {
    const buffer = await buildItinerary({
      trip: baseTrip(), // paris_0, startTime 10:00, endTime null
      attractionDurations: { paris_1: 180 }, // unrelated id
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    expect(sheet.model.merges.some(m => m.startsWith('B16'))).toBe(false);
  });

  it('endTime still wins over attractionDurations when both are present', async () => {
    const trip = baseTrip();
    trip.stops[0].selectedAttractions[0] = {
      attractionId: 'paris_0', startTime: '10:00', endTime: '11:00', date: '01/06/2026',
    };
    const buffer = await buildItinerary({
      trip,
      attractionDurations: { paris_0: 300 }, // would cover through ~15:00 if it won
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Itinerario')!;
    expect(sheet.model.merges.some(m => m.startsWith('B16'))).toBe(false); // 10:00-11:00 → 1 row, no merge
  });
});
