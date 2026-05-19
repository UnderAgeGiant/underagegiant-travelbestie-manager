export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface PlannedAttraction {
  attractionId: string;
  startTime: string;    // HH:mm
  date?: string;        // dd/mm/yyyy — which day within the stop
}

export interface Lodging {
  name: string;
  url: string;
}

export interface TripStop {
  cityId: string;
  checkIn: string;                        // dd/mm/yyyy
  checkOut: string;                       // dd/mm/yyyy
  selectedAttractions: PlannedAttraction[];
  lodging?: Lodging;
}

export type TransitMode = 'flight' | 'train' | 'boat' | 'bus' | 'car';

export interface TransitSegment {
  mode: TransitMode;
  departureDate: string;                  // dd/mm/yyyy
  departureTime: string;                  // HH:mm
  arrivalDate: string;                    // dd/mm/yyyy
  arrivalTime: string;                    // HH:mm
  notes: string;
  durationMinutes?: number;
}

export interface TransitLeg {
  fromCityId: string;
  toCityId: string;
  segments: TransitSegment[];
  date?: string;                          // dd/mm/yyyy
}

export interface Trip {
  id: string;
  title: string;
  stops: TripStop[];
  transits: TransitLeg[];
  ownerId: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  attractionId: string;
  name: string;                           // taken from JWT — never from request body
  text: string;
  rating: number;                         // 1–5
  color: string;
  date: string;
  createdAt: string;
}

export interface Karma {
  email: string;
  score: number;
}

export interface TripSuggestion {
  id: number;
  title: string;
  summary: string;
  highlights: string[];
}

export interface SuggestTripsResponse {
  options: [TripSuggestion, TripSuggestion];
}

export interface CatalogEntry { id: string; name: string; }
export type CityCatalog = Record<string, CatalogEntry[]>;

export interface PlanTripResponse {
  title: string;
  stops: TripStop[];
  transits: TransitLeg[];
}

export interface AuthPayload {
  userId: string;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      flowId: string;
      user?: AuthPayload;
      foundUser?: User;
      trip?: Trip;
      result?: unknown;
    }
  }
}
