import { OpenAPIV3 } from 'openapi-types';

// ── Reusable schemas ──────────────────────────────────────────────────────────

const PlannedAttraction: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['attractionId'],
  properties: {
    attractionId: { type: 'string', example: 'att-123' },
    startTime:    { type: 'string', nullable: true, example: '09:00', description: 'HH:mm or null' },
    endTime:      { type: 'string', nullable: true, example: '11:00', description: 'HH:mm or null' },
    date:         { type: 'string', example: '15/07/2025', description: 'dd/mm/yyyy — which day within the stop' },
    category: {
      type: 'string',
      enum: ['poi', 'freetour', 'event_party', 'foodie'],
      example: 'poi',
    },
  },
};

const Lodging: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['name', 'url'],
  properties: {
    name: { type: 'string', example: 'Hotel Ibis Roma' },
    url:  { type: 'string', example: 'https://ibis.com/roma' },
  },
};

const TripStop: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['cityId', 'checkIn', 'checkOut', 'selectedAttractions'],
  properties: {
    cityId:               { type: 'string', example: 'rome' },
    checkIn:              { type: 'string', example: '14/07/2025', description: 'dd/mm/yyyy' },
    checkOut:             { type: 'string', example: '17/07/2025', description: 'dd/mm/yyyy' },
    selectedAttractions:  { type: 'array', items: { $ref: '#/components/schemas/PlannedAttraction' } },
    lodging:              { $ref: '#/components/schemas/Lodging' },
  },
};

const TransitSegment: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['mode', 'departureDate', 'departureTime', 'arrivalDate', 'arrivalTime', 'notes'],
  properties: {
    mode:            { type: 'string', enum: ['flight', 'train', 'boat', 'bus', 'car'], example: 'flight' },
    departureDate:   { type: 'string', example: '17/07/2025', description: 'dd/mm/yyyy' },
    departureTime:   { type: 'string', example: '08:30', description: 'HH:mm' },
    arrivalDate:     { type: 'string', example: '17/07/2025', description: 'dd/mm/yyyy' },
    arrivalTime:     { type: 'string', example: '10:45', description: 'HH:mm' },
    notes:           { type: 'string', example: 'Vuelo directo Iberia IB3457' },
    durationMinutes: { type: 'integer', example: 135 },
  },
};

const TransitLeg: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['fromCityId', 'toCityId', 'segments'],
  properties: {
    fromCityId: { type: 'string', example: 'rome' },
    toCityId:   { type: 'string', example: 'paris' },
    segments:   { type: 'array', items: { $ref: '#/components/schemas/TransitSegment' } },
    date:       { type: 'string', example: '17/07/2025', description: 'dd/mm/yyyy' },
  },
};

const Trip: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id:                  { type: 'string', format: 'uuid', example: 'd4e5f6a7-...' },
    title:               { type: 'string', example: 'Europa 2025' },
    stops:               { type: 'array', items: { $ref: '#/components/schemas/TripStop' } },
    transits:            { type: 'array', items: { $ref: '#/components/schemas/TransitLeg' } },
    ownerId:             { type: 'string', format: 'uuid' },
    createdAt:           { type: 'string', format: 'date-time' },
    shareId:             { type: 'string', example: 'abc123', description: 'Present when the trip has been shared' },
    itineraryExportedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const SharedTripPayload: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id:              { type: 'string', example: 'abc123', description: 'shareId (not trip_id)' },
    tripName:        { type: 'string', example: 'Europa 2025' },
    ownerEmail:      { type: 'string', format: 'email' },
    ownerName:       { type: 'string', example: 'Matias' },
    createdAt:       { type: 'string', format: 'date-time' },
    stops:           { type: 'array', items: { $ref: '#/components/schemas/TripStop' } },
    transits:        { type: 'array', items: { $ref: '#/components/schemas/TransitLeg' } },
    planId:          { type: 'string', format: 'uuid', description: 'trips.trip_id — source plan reference' },
    tripId:          { type: 'string', format: 'uuid', description: 'Same as planId — internal UUID for favorites' },
    favoriteCount:   { type: 'integer', example: 12 },
    isFavoritedByMe: { type: 'boolean', example: false },
  },
};

const Comment: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id:           { type: 'string', format: 'uuid' },
    attractionId: { type: 'string', example: 'att-123' },
    name:         { type: 'string', example: 'Matias' },
    text:         { type: 'string', example: 'Impresionante lugar, muy recomendado.' },
    rating:       { type: 'integer', minimum: 1, maximum: 5, example: 5 },
    color:        { type: 'string', example: '#FF5733' },
    date:         { type: 'string', example: '14/07/2025' },
    createdAt:    { type: 'string', format: 'date-time' },
  },
};

const StepComment: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id:         { type: 'string', format: 'uuid' },
    stepKey:    { type: 'string', example: 'rome-day1-colosseum' },
    authorName: { type: 'string', example: 'Matias' },
    text:       { type: 'string', example: 'Este día fue espectacular, no se pierdan el Coliseo al atardecer.' },
    createdAt:  { type: 'string', format: 'date-time' },
  },
};

const KarmaPackage: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id:       { type: 'string', example: 'pack-starter' },
    karma:    { type: 'integer', example: 10 },
    price:    { type: 'string', example: '3.99' },
    currency: { type: 'string', example: 'USD' },
    label:    { type: 'string', example: 'Starter Pack' },
  },
};

const AppStats: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    cities: { type: 'integer', example: 42 },
    users:  { type: 'integer', example: 1580 },
    plans:  { type: 'integer', example: 3200 },
  },
};

const TripSuggestion: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id:         { type: 'integer', example: 1 },
    title:      { type: 'string', example: 'Ruta Mediterránea Clásica' },
    summary:    { type: 'string', example: '15 días por Roma, Nápoles y Barcelona.' },
    highlights: { type: 'array', items: { type: 'string' }, example: ['Coliseo', 'Sagrada Família'] },
  },
};

const PlanChangeInfo: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['new_session', 'free_change', 'charged_change'],
      example: 'free_change',
    },
    freeChangesUsed:      { type: 'integer', example: 1 },
    freeChangesRemaining: { type: 'integer', example: 2 },
    reason: {
      type: 'string',
      enum: ['major_change', 'limit_reached'],
      description: 'Only present on charged_change',
    },
  },
};

const AuthResponse: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    token: {
      type: 'string',
      example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
      description: 'Short-lived access JWT (15 min)',
    },
    refreshToken: {
      type: 'string',
      example: 'opaque-refresh-token-string',
      description: 'Opaque refresh token (long-lived)',
    },
    user: {
      type: 'object',
      properties: {
        userId: { type: 'string', format: 'uuid' },
        email:  { type: 'string', format: 'email' },
        name:   { type: 'string', example: 'Matias' },
      },
    },
  },
};

const ErrorResponse: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    message: { type: 'string', example: 'Unauthorized' },
  },
};

// ── Reusable responses ────────────────────────────────────────────────────────

const unauthorized: OpenAPIV3.ResponseObject = {
  description: 'Missing or invalid JWT',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
};

const notFound: OpenAPIV3.ResponseObject = {
  description: 'Resource not found',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
};

const karmaInsufficient: OpenAPIV3.ResponseObject = {
  description: 'Insufficient karma (balance too low)',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
};

const tooManyRequests: OpenAPIV3.ResponseObject = {
  description: 'Rate limit exceeded',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
};

const validationError: OpenAPIV3.ResponseObject = {
  description: 'Validation error — missing or invalid body field',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
};

// ── Full spec ─────────────────────────────────────────────────────────────────

export const swaggerSpec: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'TravelBestie Manager API',
    description: `
REST API for the TravelBestie app — trip planning, AI suggestions, karma economy, comments, and sharing.

**Authentication:** Most endpoints require a Bearer JWT obtained via \`POST /auth/login\` or \`POST /auth/register\`.
Pass it as \`Authorization: Bearer <token>\`.

**Karma system:** Creating trips, exporting itineraries, sharing, and using AI features cost karma.
Karma is earned by leaving comments and can be purchased via PayPal.

**AI Plan Change Management:** Replanning with ≤ 20 % changes is free up to 3 times per session.
The \`changeInfo\` field in \`/ai/plan\` responses tracks usage.
    `.trim(),
    version: '1.0.0',
    contact: { email: 'matias.fuentes.perez@gmail.com' },
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local dev server' },
    { url: 'https://travelbestie-manager.vercel.app', description: 'Production (Vercel)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Short-lived access JWT (15 min). Obtain via /auth/login or /auth/register.',
      },
    },
    schemas: {
      PlannedAttraction,
      Lodging,
      TripStop,
      TransitSegment,
      TransitLeg,
      Trip,
      SharedTripPayload,
      Comment,
      StepComment,
      KarmaPackage,
      AppStats,
      TripSuggestion,
      PlanChangeInfo,
      AuthResponse,
      ErrorResponse,
    },
    responses: {
      Unauthorized:        unauthorized,
      NotFound:            notFound,
      KarmaInsufficient:   karmaInsufficient,
      TooManyRequests:     tooManyRequests,
      ValidationError:     validationError,
    },
  },

  // ── Paths ───────────────────────────────────────────────────────────────────
  paths: {

    // ── Health ──────────────────────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          '200': {
            description: 'Server is up',
            content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } } } },
          },
        },
      },
    },

    // ── Auth ────────────────────────────────────────────────────────────────
    '/auth/request-otp': {
      post: {
        tags: ['Auth'],
        summary: 'Request registration OTP',
        description: 'Sends a 6-digit OTP to the given email (5-min TTL). Must be called before `/auth/register`. Rate-limited to 5 req / 15 min per IP.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email', example: 'user@example.com' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OTP sent successfully' },
          '400': { $ref: '#/components/responses/ValidationError' },
          '409': { description: 'Email already registered' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },

    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        description: 'RSA-OAEP-decrypts the payload, verifies OTP, creates the user (karma = 3), and returns tokens. Rate-limited to 10 req / 15 min per IP.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['encryptedPayload'],
                properties: {
                  encryptedPayload: {
                    type: 'string',
                    description: 'RSA-OAEP-encrypted JSON containing `{ name, email, password, otp }`',
                    example: 'base64encodedEncryptedData...',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'User created — returns access JWT, refresh token, and user profile',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '409': { description: 'Email already registered or OTP mismatch' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },

    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        description: 'RSA-OAEP-decrypts the payload, verifies password, and returns tokens.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['encryptedPayload'],
                properties: {
                  encryptedPayload: {
                    type: 'string',
                    description: 'RSA-OAEP-encrypted JSON containing `{ email, password }`',
                    example: 'base64encodedEncryptedData...',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { description: 'Wrong password or user not found' },
        },
      },
    },

    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate refresh token',
        description: 'Exchanges a valid refresh token for a new access JWT and a new refresh token (rotation). Returns 401 on invalid, expired, or revoked tokens.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string', example: 'opaque-token...' } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Token rotated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { description: 'Invalid, expired, or revoked refresh token' },
        },
      },
    },

    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout',
        description: 'Revokes the given refresh token (Redis DEL). Idempotent — calling with an already-revoked token still returns 204.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string', example: 'opaque-token...' } },
              },
            },
          },
        },
        responses: {
          '204': { description: 'Logged out — no content' },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/auth/request-profile-otp': {
      post: {
        tags: ['Auth'],
        summary: 'Request OTP to change email',
        description: 'Sends a 6-digit OTP to `newEmail` (5-min TTL, `otp:profile:` namespace). Must be called before `PUT /auth/profile` when changing email. Rate-limited to 5 req / 15 min per IP.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['newEmail'],
                properties: { newEmail: { type: 'string', format: 'email', example: 'newemail@example.com' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OTP sent to new email address' },
          '400': { description: 'Validation error or same as current email' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },

    '/auth/profile': {
      put: {
        tags: ['Auth'],
        summary: 'Update profile',
        description: `RSA-OAEP-decrypts the payload and updates any combination of name, email (OTP-verified), or password (current-password-verified).
All fields are optional — send only what you want to change.
Changing the password invalidates all existing refresh tokens via session version increment.`,
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['encryptedPayload'],
                properties: {
                  encryptedPayload: {
                    type: 'string',
                    description: 'RSA-OAEP-encrypted JSON with any of: `{ name?, newEmail?, otp?, currentPassword?, newPassword? }`',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Profile updated' },
          '400': { description: 'Validation error, wrong current password, or OTP mismatch' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    // ── Trips ───────────────────────────────────────────────────────────────
    '/trips': {
      get: {
        tags: ['Trips'],
        summary: 'List my trips',
        description: 'Returns all trips owned by the authenticated user, including `shareId` and `itineraryExportedAt`.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Array of trips',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Trip' } } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Trips'],
        summary: 'Create a trip',
        description: 'Creates a new trip. Costs **1 karma** (deducted via DB trigger). Returns 402 if karma balance < 1.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'stops'],
                properties: {
                  title:    { type: 'string', example: 'Europa 2025' },
                  stops:    { type: 'array', items: { $ref: '#/components/schemas/TripStop' } },
                  transits: { type: 'array', items: { $ref: '#/components/schemas/TransitLeg' } },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Trip created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Trip' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '402': { $ref: '#/components/responses/KarmaInsufficient' },
        },
      },
    },

    '/trips/{id}': {
      put: {
        tags: ['Trips'],
        summary: 'Update a trip',
        description: 'Updates an existing trip. Ownership is enforced — returns 404 if the trip does not belong to the caller.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title:    { type: 'string', example: 'Europa 2025 — Actualizado' },
                  stops:    { type: 'array', items: { $ref: '#/components/schemas/TripStop' } },
                  transits: { type: 'array', items: { $ref: '#/components/schemas/TransitLeg' } },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Trip updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Trip' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Trips'],
        summary: 'Delete a trip',
        description: 'Deletes a trip. Ownership is enforced.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '204': { description: 'Trip deleted — no content' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/trips/{id}/itinerary': {
      post: {
        tags: ['Trips'],
        summary: 'Export XLSX itinerary',
        description: 'Streams an `.xlsx` itinerary file for the trip. Costs **1 karma** on the first export only — subsequent exports are free.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': {
            description: 'XLSX file stream',
            content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '402': { $ref: '#/components/responses/KarmaInsufficient' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/trips/{id}/share': {
      post: {
        tags: ['Trips'],
        summary: 'Share a trip',
        description: 'Creates a public share link for the trip. Costs **1 karma** on the first share only — re-sharing is free and returns the existing `shareId`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': {
            description: 'Share created or already exists',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { shareId: { type: 'string', example: 'abc123' } },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '402': { $ref: '#/components/responses/KarmaInsufficient' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/trips/{id}/clone': {
      post: {
        tags: ['Trips'],
        summary: 'Clone own trip',
        description: 'Duplicates the caller\'s own trip. The new trip title is prefixed with `"Copia de "` and starts unshared. Costs **1 karma**.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '201': {
            description: 'Cloned trip',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Trip' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '402': { $ref: '#/components/responses/KarmaInsufficient' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Shared trips ─────────────────────────────────────────────────────────
    '/shared': {
      get: {
        tags: ['Shared Trips'],
        summary: 'Search public shared trips',
        description: 'ILIKE search on trip title and owner name. Returns up to 5 results. Rate-limited to 30 req / min.',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string', example: 'Europa' }, description: 'Search query' },
        ],
        responses: {
          '200': {
            description: 'Matching shared trips',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/SharedTripPayload' } } } },
          },
          '429': { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },

    '/shared/{shareId}': {
      get: {
        tags: ['Shared Trips'],
        summary: 'Get a single shared trip',
        description: 'Returns the full trip payload including `planId`, `favoriteCount`, and (if authenticated) `isFavoritedByMe`. Rate-limited to 60 req / min.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'shareId', in: 'path', required: true, schema: { type: 'string', example: 'abc123' } }],
        responses: {
          '200': {
            description: 'Shared trip payload',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SharedTripPayload' } } },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },

    '/shared/{shareId}/clone': {
      post: {
        tags: ['Shared Trips'],
        summary: 'Clone a shared trip',
        description: 'Clones another user\'s shared trip into the caller\'s account. Title prefixed with `"Copia de "`, starts unshared. Costs **1 karma**.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'shareId', in: 'path', required: true, schema: { type: 'string', example: 'abc123' } }],
        responses: {
          '201': {
            description: 'Cloned trip',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Trip' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '402': { $ref: '#/components/responses/KarmaInsufficient' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/shared/{shareId}/favorite': {
      post: {
        tags: ['Shared Trips'],
        summary: 'Toggle favorite on a shared trip',
        description: 'Adds or removes the trip from the caller\'s favorites. Returns the new state and updated count.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'shareId', in: 'path', required: true, schema: { type: 'string', example: 'abc123' } }],
        responses: {
          '200': {
            description: 'Favorite toggled',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    favorited:     { type: 'boolean', example: true },
                    favoriteCount: { type: 'integer', example: 13 },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Step comments (shared trip plan) ─────────────────────────────────────
    '/shared/{shareId}/comments': {
      get: {
        tags: ['Step Comments'],
        summary: 'Get all step comments for a shared trip',
        description: 'Returns comments grouped by `stepKey` as a `Record<string, StepComment[]>`.',
        parameters: [{ name: 'shareId', in: 'path', required: true, schema: { type: 'string', example: 'abc123' } }],
        responses: {
          '200': {
            description: 'Step comments map',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: { type: 'array', items: { $ref: '#/components/schemas/StepComment' } },
                  example: { 'rome-day1-colosseum': [{ id: 'uuid', stepKey: 'rome-day1-colosseum', authorName: 'Matias', text: '...', createdAt: '2025-07-14T10:00:00Z' }] },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/shared/{shareId}/comments/{stepKey}': {
      post: {
        tags: ['Step Comments'],
        summary: 'Add a step comment',
        description: 'Posts a comment on a specific step of a shared trip plan. Minimum 50 characters. Awards **+1 karma** if this is the user\'s first comment on this step.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'shareId', in: 'path', required: true, schema: { type: 'string', example: 'abc123' } },
          { name: 'stepKey', in: 'path', required: true, schema: { type: 'string', example: 'rome-day1-colosseum' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['text'],
                properties: {
                  text: { type: 'string', minLength: 50, example: 'El Coliseo es impresionante al atardecer. Fuimos en temporada baja y no había tanta gente.' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Comment added',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    comment:      { $ref: '#/components/schemas/StepComment' },
                    karmaAwarded: { type: 'boolean', example: true },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { description: 'Comment too similar to a recent post' },
          '429': { description: 'Comment cooldown — must wait before posting again' },
        },
      },
    },

    // ── Attraction Comments ───────────────────────────────────────────────────
    '/comments': {
      get: {
        tags: ['Attraction Comments'],
        summary: 'Batch-get comments for multiple attractions',
        description: 'Pass 1–50 attraction IDs as a comma-separated `ids` query param. Returns `Record<attractionId, Comment[]>`. Redis-cached per attraction (60 s TTL). Rate-limited to 60 req / min.',
        parameters: [
          {
            name: 'ids',
            in: 'query',
            required: true,
            schema: { type: 'string', example: 'att-123,att-456,att-789' },
            description: 'Comma-separated attraction IDs (1–50)',
          },
        ],
        responses: {
          '200': {
            description: 'Comments grouped by attraction ID',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: { type: 'array', items: { $ref: '#/components/schemas/Comment' } },
                },
              },
            },
          },
          '400': { description: 'No IDs provided or too many IDs (> 50)' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },

    '/comments/{attractionId}': {
      get: {
        tags: ['Attraction Comments'],
        summary: 'Get comments for an attraction',
        parameters: [{ name: 'attractionId', in: 'path', required: true, schema: { type: 'string', example: 'att-123' } }],
        responses: {
          '200': {
            description: 'List of comments',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Comment' } } } },
          },
        },
      },
      post: {
        tags: ['Attraction Comments'],
        summary: 'Add a comment',
        description: 'Posts a comment on an attraction. Awards **+1 karma** on the user\'s first comment for this attraction (via DB trigger). Subject to cooldown and similarity checks.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'attractionId', in: 'path', required: true, schema: { type: 'string', example: 'att-123' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['text', 'rating', 'color', 'date'],
                properties: {
                  text:   { type: 'string', example: 'Impresionante lugar, muy recomendado.' },
                  rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
                  color:  { type: 'string', example: '#FF5733' },
                  date:   { type: 'string', example: '14/07/2025', description: 'dd/mm/yyyy' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Comment added',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Comment' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '409': { description: 'Comment too similar to a recent post' },
          '429': { description: 'Comment cooldown — must wait before posting again' },
        },
      },
    },

    // ── Karma ────────────────────────────────────────────────────────────────
    '/karma': {
      get: {
        tags: ['Karma'],
        summary: 'Get my karma score',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current karma',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', format: 'email' },
                    score: { type: 'integer', example: 7 },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/karma/packages': {
      get: {
        tags: ['Karma'],
        summary: 'List purchasable karma packages',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Available packages',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/KarmaPackage' } } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/karma/purchase/create-order': {
      post: {
        tags: ['Karma'],
        summary: 'Create a PayPal order',
        description: 'Creates a PayPal order for the given karma package. Returns the `orderID` needed to open the PayPal payment flow on the frontend.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['packageId'],
                properties: { packageId: { type: 'string', example: 'pack-starter' } },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Order created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { orderID: { type: 'string', example: 'PAYPAL-ORDER-ID-12345' } },
                },
              },
            },
          },
          '400': { description: 'Invalid packageId' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/karma/purchase/capture-order': {
      post: {
        tags: ['Karma'],
        summary: 'Capture a PayPal order and credit karma',
        description: 'Verifies ownership of the order, captures payment via PayPal, credits karma to the user, and sends a confirmation email.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['orderID'],
                properties: { orderID: { type: 'string', example: 'PAYPAL-ORDER-ID-12345' } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Purchase completed — karma credited',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    newKarmaTotal: { type: 'integer', example: 17 },
                    purchase: {
                      type: 'object',
                      properties: {
                        purchaseId:        { type: 'string', format: 'uuid' },
                        provider:          { type: 'string', example: 'paypal' },
                        karmaAmount:       { type: 'integer', example: 10 },
                        amount:            { type: 'string', example: '3.99' },
                        currency:          { type: 'string', example: 'USD' },
                        status:            { type: 'string', example: 'completed' },
                        completedAt:       { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid or already-captured orderID' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { description: 'Order does not belong to the caller' },
        },
      },
    },

    // ── AI ───────────────────────────────────────────────────────────────────
    '/ai/suggest': {
      post: {
        tags: ['AI'],
        summary: 'Get AI trip suggestions',
        description: 'Calls DeepSeek AI to generate 2 trip suggestion options based on the user\'s preferences. Costs **9 karma**. Returns 402 if balance < 9.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['preferences'],
                properties: {
                  preferences: { type: 'string', minLength: 1, example: 'Quiero un viaje romántico por Europa en verano, con buen clima y buena gastronomía.' },
                  duration:    { type: 'integer', example: 14, description: 'Trip duration in days (optional)' },
                  budget:      { type: 'string', example: 'medio', description: 'Budget range (optional)' },
                  startDate:   { type: 'string', example: '01/07/2025', description: 'Preferred start date dd/mm/yyyy (optional)' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Two trip suggestions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    options: {
                      type: 'array',
                      minItems: 2,
                      maxItems: 2,
                      items: { $ref: '#/components/schemas/TripSuggestion' },
                    },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '402': { $ref: '#/components/responses/KarmaInsufficient' },
        },
      },
    },

    '/ai/plan': {
      post: {
        tags: ['AI'],
        summary: 'Generate AI full itinerary plan',
        description: `Calls DeepSeek AI to build a full trip itinerary from the selected suggestion and preferences.

**Karma cost:** 1 karma — **free** for minor re-plans (≤ 20% change from the session baseline, up to 3 times).
The \`changeInfo\` field in the response tracks session state.

Pass the \`planSessionId\` returned from \`/ai/suggest\` (or a generated UUID) to maintain the free-change session across calls.`,
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['preferences', 'selectedOption'],
                properties: {
                  preferences:    { type: 'string', minLength: 1, example: 'Quiero enfocarnos en gastronomía y museos.' },
                  selectedOption: {
                    $ref: '#/components/schemas/TripSuggestion',
                  },
                  planSessionId:  { type: 'string', format: 'uuid', description: 'Session ID from /ai/suggest. Omit to start a new session.' },
                  duration:       { type: 'integer', example: 14 },
                  budget:         { type: 'string', example: 'medio' },
                  startDate:      { type: 'string', example: '01/07/2025' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Generated itinerary plan',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title:      { type: 'string', example: 'Ruta Mediterránea — 14 días' },
                    stops:      { type: 'array', items: { $ref: '#/components/schemas/TripStop' } },
                    transits:   { type: 'array', items: { $ref: '#/components/schemas/TransitLeg' } },
                    changeInfo: { $ref: '#/components/schemas/PlanChangeInfo' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '402': { $ref: '#/components/responses/KarmaInsufficient' },
        },
      },
    },

    // ── Favorites ────────────────────────────────────────────────────────────
    '/favorites': {
      get: {
        tags: ['Favorites'],
        summary: 'List my favorited trips',
        description: 'Returns all shared trips the authenticated user has favorited, ordered by `favoritedAt` descending.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Favorited trips',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    allOf: [
                      { $ref: '#/components/schemas/SharedTripPayload' },
                      { type: 'object', properties: { favoritedAt: { type: 'string', format: 'date-time' } } },
                    ],
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    // ── Landing ──────────────────────────────────────────────────────────────
    '/featured': {
      get: {
        tags: ['Landing'],
        summary: 'Featured trips',
        description: 'Returns trips from `FEATURED_TRIP_IDS` env var. Redis-cached for 24 hours. Returns `[]` if the env var is unset.',
        responses: {
          '200': {
            description: 'Featured shared trips',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/SharedTripPayload' } } } },
          },
        },
      },
    },

    '/stats': {
      get: {
        tags: ['Landing'],
        summary: 'App-wide stats',
        description: 'Returns `{ cities, users, plans }`. Redis-cached for 1 hour.',
        responses: {
          '200': {
            description: 'App stats',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AppStats' } } },
          },
        },
      },
    },
  },
};
