// Every visible string in the itinerary export, in both app languages (F78).
// Templates use {name} placeholders, filled by fmt() in ./util.

export type ItineraryLocale = 'es-CL' | 'en-US';

const ES = {
  // Sheet names
  sheetItinerario: 'Itinerario',
  sheetTransporte: 'Transporte',
  sheetHospedaje: 'Hospedaje',

  subtitle: 'Tripilove · Tu viaje ideal ✈',
  origin: 'Origen',
  destination: 'Destino',
  modeFlight: 'Vuelo',
  modeTrain: 'Tren',
  modeBus: 'Bus',
  modeBoat: 'Ferry',
  modeCar: 'Auto',

  // Itinerario grid
  gridCorner: 'Horario / Día',
  transitDeparts: '{time} Sale {mode} → {to}',
  transitArrives: '{time} Llega {mode} desde {from}',
  inTransit: 'En tránsito · {mode}',
  overlap: '⚠️ {n} atracciones se superponen',
  attractionFallback: '{city} - Attraction {n}',
  legendTicket: 'Necesita comprar entrada',
  legendAttraction: 'Atracción',
  legendTransit: 'Transporte',
  legendOverlap: 'Atracciones superpuestas (ver comentario en la celda)',
  legendPersonal: 'Actividad personal',
  ticketBought: '✅ Entrada comprada',

  // Transporte
  hdrRoute: 'Ruta',
  hdrDay: 'Día',
  hdrDeparture: 'Hora Salida',
  hdrArrival: 'Hora Llegada',
  hdrDuration: 'Duración',
  hdrMode: 'Tipo',
  hdrCarrier: 'Empresa',
  hdrLocation: 'Ubicación',
  seeMap: 'Ver mapa',

  // Hospedaje
  hdrCity: 'Ciudad',
  hdrCheckIn: 'Día Llegada',
  hdrCheckOut: 'Día Salida',
  hdrName: 'Nombre',
  hdrNights: 'Noches',
  hdrAddress: 'Dirección',
  hdrLodgingNotes: 'Observaciones',

  // Workbook (F78)
  sheetResumen: 'Resumen',
  sheetAtracciones: 'Atracciones',
  sheetCostos: 'Costos',
  sheetClima: 'Clima',
  sheetAntes: 'Antes de viajar',
  dayOne: '{n} día',
  dayMany: '{n} días',
  nightOne: '{n} noche',
  nightMany: '{n} noches',
  adultOne: '{n} adulto',
  adultMany: '{n} adultos',
  childOne: '{n} niño',
  childMany: '{n} niños',
  infantOne: '{n} bebé',
  infantMany: '{n} bebés',

  // Resumen
  resDates: '📅 Fechas',
  resRoute: '📍 Ruta',
  resTravelers: '👥 Viajeros',
  resLink: '🔗 Ver en Tripilove',
  costSection: '💰 Costo estimado del viaje (aproximado)',
  costCategory: 'Categoría',
  costShare: '% del total',
  costFlights: '✈️ Vuelos',
  costLodging: '🏨 Hospedaje',
  costTickets: '🎟️ Entradas',
  costGround: '🚕 Transporte terrestre',
  costTotal: 'TOTAL',
  costCalculatedOn: 'Calculado el {date}',
  costStale: 'Puede estar desactualizado: el viaje cambió después del cálculo',
  costNeverCalculated: 'Aún no calculamos el costo de este viaje',
  costCalculateCta: 'Abre tus viajes en Tripilove para calcularlo',
  indexSection: '📑 Contenido',
  idxItinerario: 'Calendario hora a hora',
  idxAtracciones: 'Horarios, entradas y links de cada actividad',
  idxCostos: 'Detalle del costo estimado',
  idxClima: 'Clima por día',
  idxAntes: 'Visa, moneda, enchufes y checklist',
  idxTransporte: 'Tramos',
  idxHospedaje: 'Alojamientos',

  // Atracciones
  hdrStart: 'Inicio',
  hdrEnd: 'Fin',
  hdrAttraction: 'Atracción',
  hdrLocalName: 'Nombre local',
  hdrRating: '⭐',
  hdrHoursToday: 'Horario ese día',
  hdrTicket: 'Entrada',
  hdrWebsite: 'Sitio web',
  hdrBuyTicket: 'Comprar entrada',
  hdrMaps: 'Google Maps',
  hdrDescription: 'Descripción',
  ticketNeeded: 'Necesita entrada',
  ticketNone: 'No necesita',
  linkWeb: '🌐 Web',
  linkBuy: '🎟️ Comprar',
  linkMap: '📍 Mapa',
};

export type ItineraryLabels = typeof ES;

const EN: ItineraryLabels = {
  sheetItinerario: 'Itinerary',
  sheetTransporte: 'Transport',
  sheetHospedaje: 'Lodging',

  subtitle: 'Tripilove · Your ideal trip ✈',
  origin: 'Origin',
  destination: 'Destination',
  modeFlight: 'Flight',
  modeTrain: 'Train',
  modeBus: 'Bus',
  modeBoat: 'Ferry',
  modeCar: 'Car',

  gridCorner: 'Time / Day',
  transitDeparts: '{time} {mode} departs → {to}',
  transitArrives: '{time} {mode} arrives from {from}',
  inTransit: 'In transit · {mode}',
  overlap: '⚠️ {n} attractions overlap',
  attractionFallback: '{city} - Attraction {n}',
  legendTicket: 'Ticket needed',
  legendAttraction: 'Attraction',
  legendTransit: 'Transport',
  legendOverlap: 'Overlapping attractions (see the cell comment)',
  legendPersonal: 'Personal activity',
  ticketBought: '✅ Ticket bought',

  hdrRoute: 'Route',
  hdrDay: 'Day',
  hdrDeparture: 'Departure',
  hdrArrival: 'Arrival',
  hdrDuration: 'Duration',
  hdrMode: 'Type',
  hdrCarrier: 'Carrier',
  hdrLocation: 'Location',
  seeMap: 'See map',

  hdrCity: 'City',
  hdrCheckIn: 'Check-in',
  hdrCheckOut: 'Check-out',
  hdrName: 'Name',
  hdrNights: 'Nights',
  hdrAddress: 'Address',
  hdrLodgingNotes: 'Notes',

  sheetResumen: 'Summary',
  sheetAtracciones: 'Attractions',
  sheetCostos: 'Costs',
  sheetClima: 'Weather',
  sheetAntes: 'Before you go',
  dayOne: '{n} day',
  dayMany: '{n} days',
  nightOne: '{n} night',
  nightMany: '{n} nights',
  adultOne: '{n} adult',
  adultMany: '{n} adults',
  childOne: '{n} child',
  childMany: '{n} children',
  infantOne: '{n} infant',
  infantMany: '{n} infants',

  resDates: '📅 Dates',
  resRoute: '📍 Route',
  resTravelers: '👥 Travelers',
  resLink: '🔗 View on Tripilove',
  costSection: '💰 Estimated trip cost (approximate)',
  costCategory: 'Category',
  costShare: '% of total',
  costFlights: '✈️ Flights',
  costLodging: '🏨 Lodging',
  costTickets: '🎟️ Tickets',
  costGround: '🚕 Ground transport',
  costTotal: 'TOTAL',
  costCalculatedOn: 'Calculated on {date}',
  costStale: 'May be out of date: the trip changed after it was calculated',
  costNeverCalculated: "We haven't calculated this trip's cost yet",
  costCalculateCta: 'Open your trips on Tripilove to calculate it',
  indexSection: '📑 Contents',
  idxItinerario: 'Hour-by-hour calendar',
  idxAtracciones: 'Hours, tickets and links for each activity',
  idxCostos: 'Estimated cost breakdown',
  idxClima: 'Weather by day',
  idxAntes: 'Visa, currency, plugs and checklist',
  idxTransporte: 'Legs',
  idxHospedaje: 'Places to stay',

  hdrStart: 'Start',
  hdrEnd: 'End',
  hdrAttraction: 'Name',
  hdrLocalName: 'Local name',
  hdrRating: '⭐',
  hdrHoursToday: 'Hours that day',
  hdrTicket: 'Ticket',
  hdrWebsite: 'Website',
  hdrBuyTicket: 'Buy ticket',
  hdrMaps: 'Google Maps',
  hdrDescription: 'Description',
  ticketNeeded: 'Ticket needed',
  ticketNone: 'Not needed',
  linkWeb: '🌐 Website',
  linkBuy: '🎟️ Buy',
  linkMap: '📍 Map',
};

export const ITINERARY_LABELS: Record<ItineraryLocale, ItineraryLabels> = { 'es-CL': ES, 'en-US': EN };

export function resolveLocale(locale?: string): ItineraryLocale {
  return locale === 'en-US' ? 'en-US' : 'es-CL';
}

export function labelsFor(locale?: string): ItineraryLabels {
  return ITINERARY_LABELS[resolveLocale(locale)];
}

export function modeLabel(l: ItineraryLabels, mode: string): string {
  const byMode: Record<string, string> = { flight: l.modeFlight, train: l.modeTrain, bus: l.modeBus, boat: l.modeBoat, car: l.modeCar };
  return byMode[mode] ?? mode;
}

// WMO weather codes (Open-Meteo). Icons mirror the frontend's weather.model.ts groups.
const WEATHER_GROUPS: Array<{ codes: number[]; icon: string; es: string; en: string }> = [
  { codes: [0], icon: '☀️', es: 'Despejado', en: 'Clear' },
  { codes: [1, 2], icon: '🌤️', es: 'Parcialmente nublado', en: 'Partly cloudy' },
  { codes: [3], icon: '☁️', es: 'Nublado', en: 'Cloudy' },
  { codes: [45, 48], icon: '🌫️', es: 'Niebla', en: 'Fog' },
  { codes: [51, 53, 55, 56, 57], icon: '🌦️', es: 'Llovizna', en: 'Drizzle' },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], icon: '🌧️', es: 'Lluvia', en: 'Rain' },
  { codes: [71, 73, 75, 77, 85, 86], icon: '❄️', es: 'Nieve', en: 'Snow' },
  { codes: [95, 96, 99], icon: '⛈️', es: 'Tormenta', en: 'Thunderstorm' },
];

export function weatherCodeLabel(code: number | undefined, locale: ItineraryLocale): { icon: string; label: string } {
  const g = code === undefined ? undefined : WEATHER_GROUPS.find(x => x.codes.includes(code));
  if (!g) return { icon: '🌡️', label: locale === 'en-US' ? 'Unknown' : 'Sin datos' };
  return { icon: g.icon, label: locale === 'en-US' ? g.en : g.es };
}
