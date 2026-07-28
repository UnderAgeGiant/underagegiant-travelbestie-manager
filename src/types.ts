export type AttractionCategory = 'poi' | 'freetour' | 'event_party' | 'foodie';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  homeCity: string | null;
  createdAt: string;
}

export interface PlannedAttraction {
  attractionId: string;
  startTime: string | null;   // HH:mm — null when not set
  endTime:   string | null;   // HH:mm — null when not set
  date?: string;              // dd/mm/yyyy — which day within the stop
  category?: AttractionCategory; // null treated as 'poi' in app
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
  shareId?: string;
  itineraryExportedAt?: string;
}

export interface SharedTripPayload {
  id:               string;   // shareId (not trip_id)
  tripName:         string;
  ownerId?:         string;   // internal user UUID — populated by findByShareId; consumed by notify middleware
  ownerEmail:       string;
  ownerName:        string;
  createdAt:        string;
  stops:            TripStop[];
  transits:         TransitLeg[];
  planId:           string;   // trips.trip_id — used by the frontend to reference the source plan
  tripId:           string;   // same as planId — internal UUID used by favorites
  favoriteCount?:   number;
  isFavoritedByMe?: boolean;
}

export interface FavoriteToggleResult {
  favorited:     boolean;
  favoriteCount: number;
}

export interface FavoritedTrip extends SharedTripPayload {
  favoritedAt: string;   // ISO-8601
}

// ── In-app notifications (Feature 25) ──────────────────────────────────────

/**
 * Discriminator for every notification. Future triggers (e.g. Feature 16's
 * collaborator invite) extend this union — the bell renders any type, so no
 * frontend change is needed. Also the hook for a future per-type mute.
 */
export type NotificationType = 'comment' | 'favorite' | 'clone' | 'purchase';

export interface NotificationRecord {
  notificationId: string;
  userId:         string;
  type:           NotificationType;
  title:          string;
  body:           string;
  url:            string;   // relative deep link, e.g. /?share=abc
  read:           boolean;
  createdAt:      string;   // ISO-8601
}

export interface AppStats {
  cities: number;
  users:  number;
  plans:  number;
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
  cityIds?: string[];
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

export interface KarmaPackage {
  id: string;
  karma: number;
  price: string;    // string to preserve exact decimal, e.g. "3.99"
  currency: string; // ISO 4217 code, e.g. "USD", "CLP"
  label: string;
}

export interface KarmaPurchase {
  purchaseId: string;
  userId: string;
  provider: string;             // 'paypal', 'mercadopago', etc.
  providerOrderId: string;      // provider's order ID
  providerCaptureId: string | null; // provider's capture ID; null until captured
  packageId: string;
  karmaAmount: number;
  amount: string;               // price as string to preserve decimal
  currency: string;             // ISO 4217 code
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  createdAt: string;
  completedAt: string | null;
}

export interface CompleteKarmaPurchaseResult {
  purchase: KarmaPurchase;
  newKarmaTotal: number;
}

// ── AI Plan Change Management ──────────────────────────────────────────────

export interface PlanSessionOptions {
  selectedOptionTitle:      string;
  selectedOptionSummary:    string;
  selectedOptionHighlights: string[];
  preferences:              string;
  duration:                 number;  // 0 when not specified
  budget:                   string;  // '' when not specified
  startDate:                string;  // '' when not specified
}

export interface PlanChangeInfo {
  type:                 'new_session' | 'free_change' | 'charged_change';
  freeChangesUsed:      number;   // count AFTER this call
  freeChangesRemaining: number;   // 0 when charged or limit reached
  reason?:              'major_change' | 'limit_reached'; // only on charged_change
}

export type PlanChangeResult =
  | { type: 'new_session' }
  | {
      type:                 'free_change';
      freeChangesUsed:      number;   // count BEFORE this change
      freeChangesRemaining: number;   // remaining AFTER this change = 2 - freeChangesUsed
      originalOptions:      PlanSessionOptions;
    }
  | {
      type:            'charged_change';
      reason:          'major_change' | 'limit_reached';
      freeChangesUsed: number;
      originalOptions: PlanSessionOptions;
    };

export interface StepComment {
  id:         string;
  stepKey:    string;
  authorName: string;
  text:       string;
  createdAt:  string;
}

export type StepCommentsMap = Record<string, StepComment[]>;

export interface StepCommentAddResult {
  comment:      StepComment;
  karmaAwarded: boolean;
}

declare global {
  namespace Express {
    interface Request {
      flowId: string;
      user?: AuthPayload;
      foundUser?: User;
      newEmailUser?: User;
      newPasswordHash?: string;
      tokenUserId?: string;          // userId extracted from a validated refresh token
      newRawRefreshToken?: string;   // new raw refresh token after rotation
      trip?: Trip;
      karmaPurchase?: KarmaPurchase;
      result?: unknown;
      planChangeResult?: PlanChangeResult;   // ← plan change management
      sharedTripMeta?: { tripId: string; ownerId: string; tripName?: string };
    }
  }
}
