import { CostEstimate, Trip } from '../../src/types';

export function fixtureTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1', title: 'Perú 2027', ownerId: 'u1', createdAt: '2026-11-01T00:00:00Z',
    stops: [
      { cityId: 'lima', checkIn: '12/03/2027', checkOut: '16/03/2027', selectedAttractions: [] },
      { cityId: 'cusco', checkIn: '16/03/2027', checkOut: '19/03/2027', selectedAttractions: [] },
    ],
    transits: [],
    costSettings: { adults: 2, children: 0, infants: 0, comfort: 'mid', origin: { geonameId: 1, name: 'Santiago', countryCode: 'CL', iata: 'SCL' } },
    costEstimate: null,
    ...overrides,
  };
}

export function fixtureEstimate(overrides: Partial<CostEstimate> = {}): CostEstimate {
  return {
    totalUsd: 1856, flightsUsd: 900, lodgingUsd: 600, ticketsUsd: 106, groundUsd: 250,
    nights: 7, rooms: 1, ticketCount: 4, unpricedTicketCount: 1, unestimated: [], missingOrigin: false,
    settings: { adults: 2, children: 0, infants: 0, comfort: 'mid', origin: null },
    inputsHash: 'h', calculatedAt: '2026-10-23T15:00:00Z',
    ...overrides,
  };
}
