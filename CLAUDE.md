# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # ts-node api/index.ts → http://localhost:3000 (loads local.env)
npm run build        # tsc → ./dist
npm test             # jest (all test files in tests/)
npx jest tests/auth.test.ts          # run a single test file
npx jest --watch                     # watch mode
npx jest --testNamePattern "karma"   # run tests matching a pattern
```

## Architecture

**Middleware-centric pipeline.** Every route is a chain of named, single-purpose middleware functions. The request flow is:

```
Router → [validate] → [requireAuth?] → [domain middleware…] → [controller] → [domain middleware…] → respond(status)
```

**Controllers** (`src/controllers/`) are pure external-service adapters — each calls exactly one repository method, attaches the result to `req` (`req.foundUser`, `req.trip`, `req.result`), and calls `next()`. They contain **zero** conditionals, zero status codes, zero business logic.

**All business logic** lives in middleware functions (`src/middleware/`). Each function does exactly one thing.

**`src/container.ts`** is the single composition root — the only file that imports concrete `Pg*` repository classes. Swap in a different DB implementation here without touching anything else.

**`src/lib/db.ts`** exports a single `pg.Pool` instance driven by `DATABASE_URL`. All repositories receive it via constructor injection.

**`api/dotenv-setup.ts`** is imported as the very first line of `api/index.ts` and calls `dotenv.config({ path: 'local.env' })` before any other module is loaded. This is required because TypeScript `import` statements compile to top-level `require()` calls — if `src/app` (and therefore `db.ts`) were imported before dotenv ran, `DATABASE_URL` would be `undefined` when the Pool is constructed, causing an `AggregateError` on the first query.

**`respond(status)`** from `src/middleware/respond.middleware.ts` is the terminal step in every route chain — it sends `req.result` as JSON (or 204 with no body).

## Database

PostgreSQL is the only persistence layer. Schema lives in `docs/superpowers/plans/travelbestie-schema.sql`. The schema includes two triggers that handle karma automatically — no application middleware is needed:

| Trigger | Table | Effect |
|---|---|---|
| `trg_trip_karma` | `trips` AFTER INSERT | Deducts −1 from `users.karma`; inserts a `karma_events` row |
| `trg_attraction_comment_karma` | `attraction_comments` AFTER INSERT | Awards +1 on the user's **first** comment per attraction (guarded by PK conflict on `user_attraction_karma`) |

**Repositories** (`src/repositories/pg/`) map domain types to SQL:

| Class | Tables touched |
|---|---|
| `PgUserRepository` | `users` |
| `PgTripRepository` | `trips`, `trip_stops`, `stop_lodgings`, `planned_attractions`, `transit_legs`, `transit_segments` |
| `PgCommentRepository` | `attraction_comments` (JOINs `users` for `name` on reads) |
| `PgKarmaRepository` | `users.karma` (read: `get`); application-layer writes: `spend(userId, refId)` deducts −1 for itinerary export; `spendAmount(userId, amount, reason)` deducts variable amounts for AI calls. Both methods use a `PoolClient` transaction with `FOR UPDATE` lock. |
| `PgKarmaPurchaseRepository` | `karma_purchases` + `users.karma` + `karma_events` (atomic in a single transaction via `completePurchase`). Interface: `IKarmaPurchaseRepository`. |

**Date handling:** domain types use `dd/mm/yyyy`; PostgreSQL `DATE` columns use `yyyy-mm-dd`. `pg-trip.repository.ts` converts bidirectionally via `toISO()` / `toDMY()`. PostgreSQL `TIME` columns return `HH:mm:ss`; the `toHM()` helper strips seconds.

**Writes are transactional.** `PgTripRepository.create()` and `.update()` use a `PoolClient` with `BEGIN / COMMIT / ROLLBACK` to keep the trip row and all its children (stops, lodgings, attractions, legs, segments) consistent.

## Key Middleware

| File | What it does |
|---|---|
| `request-logger.middleware.ts` | Assigns UUID `req.flowId`; logs `→ request` on entry and `← response` (with status + ms) via `res.on('finish')` |
| `auth/decrypt-payload.middleware.ts` | RSA-OAEP decrypts `encryptedPayload` from the body; merges plaintext fields back into `req.body` |
| `auth/require-auth.middleware.ts` | Verifies `Authorization: Bearer <jwt>`, writes `req.user` |
| `auth/sign-token.middleware.ts` | Reads `req.foundUser`, signs JWT, writes `req.result = { token, user }` |
| `auth/verify-password.middleware.ts` | Compares `req.body.password` against `req.foundUser.passwordHash`; 401 if missing or wrong |
| `trips/check-trip-ownership.middleware.ts` | 404 if `req.trip` is absent or `ownerId !== req.user.userId` |
| `comments/inject-comment-author.middleware.ts` | Sets `req.body.name = req.user.name` (prevents name spoofing) |
| `trips/generate-itinerary.middleware.ts` | Reads `req.trip` + `req.body.{cityNames,attractionNames}`; calls `buildItinerary()`; streams buffer as `.xlsx` attachment (bypasses `respond()`) |
| `karma/validate-karma-package.middleware.ts` | Validates `req.body.packageId` against `KARMA_PACKAGES`; 400 if unknown |
| `karma/verify-purchase-ownership.middleware.ts` | Loads purchase by `orderID`, checks `userId` ownership and `status === 'pending'`; attaches `req.karmaPurchase` |
| `karma/send-karma-confirmation-email.middleware.ts` | Fires branded HTML confirmation email via `waitUntil()` after a successful capture; reads `newKarmaTotal` from `req.result` for the balance block |

> Karma side-effect middleware was removed — both `apply-karma-on-trip` and `apply-karma-on-comment` are now handled by PostgreSQL triggers.

> **Itinerary export deduplication:** `skipIfExported` (defined inline in `trips.routes.ts`) wraps `karma.requireForTrip`, `karma.spend`, and `trip.recordExport` — all three are bypassed when `req.trip.itineraryExportedAt` is already set. `generateItinerary` always runs regardless.

## Payment (Karma Purchase)

Provider-neutral architecture — DB schema and TypeScript types use generic field names; PayPal-specific code is isolated in `src/lib/paypal.ts`.

**Flow:** `POST /karma/purchase/create-order` → PayPal creates order → frontend renders PayPal button → user pays → `POST /karma/purchase/capture-order` → backend captures payment, credits karma, sends confirmation email.

**Key files:**

| File | Purpose |
|---|---|
| `src/lib/karma-packages.ts` | Static package catalog (`KARMA_PACKAGES`, `findPackage(id)`) |
| `src/lib/paypal.ts` | PayPal-specific: `createPayPalOrder(price, packageId)`, `capturePayPalOrder(orderId)` — calls PayPal REST v2; reads `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE` |
| `src/repositories/interfaces/karma-purchase.repository.ts` | `IKarmaPurchaseRepository` interface |
| `src/repositories/pg/pg-karma-purchase.repository.ts` | PostgreSQL implementation; `completePurchase` atomically updates purchase row, credits `users.karma`, inserts `karma_events` |
| `src/controllers/karma-purchase.controller.ts` | `createOrder` (hardcodes provider `'paypal'`), `captureOrder` |
| `src/templates/Karma-Confirmation-Email.html` | Branded HTML template with placeholders: `{user_name}`, `{karma_amount}`, `{package_label}`, `{amount}`, `{currency}`, `{capture_id}`, `{purchase_date}`, `{new_balance}` |

**Adding a new provider** (e.g. MercadoPago): create `src/lib/mercadopago.ts`, add a new controller that passes `'mercadopago'` as the provider string to `createPurchaseIntent` — no schema or repository changes needed.

## Logger

`src/lib/logger.ts` exports `logger.info`, `logger.warn`, `logger.error`. Each call emits one JSON line to stdout:

```
{"ts":"…","level":"INFO","flowId":"uuid","method":"GET","path":"/trips","status":200,"ms":3,"msg":"← response"}
```

`requestLoggerMiddleware` is the **first** middleware in `app.ts` (before CORS and `express.json()`). It captures `req.originalUrl` at entry time — **not** `req.path` — because Express mutates `req.path` as it descends into sub-routers, so the finish callback would log the wrong path otherwise.

`req.flowId` is typed as `string` on the Express `Request` interface in `src/types.ts`. All log calls from `error.middleware.ts` also include `flowId` so 500-level errors can be correlated to their request.

## API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | RSA-decrypt → validate → hash → create user → JWT |
| POST | `/auth/login` | — | RSA-decrypt → validate → verify → JWT |
| GET | `/trips` | Bearer | List trips for authenticated user |
| POST | `/trips` | Bearer | Create trip (karma −1 fired by DB trigger) |
| PUT | `/trips/:id` | Bearer | Update trip (ownership enforced) |
| DELETE | `/trips/:id` | Bearer | Delete trip (ownership enforced) |
| GET | `/comments/:attractionId` | — | Get comments for an attraction |
| POST | `/comments/:attractionId` | Bearer | Add comment (karma +1 on first comment, fired by DB trigger) |
| GET | `/karma` | Bearer | Get authenticated user's karma score |
| GET | `/karma/packages` | — | List purchasable karma packages |
| POST | `/karma/purchase/create-order` | Bearer | Create a PayPal order for a karma package; returns `{ orderID }` |
| POST | `/karma/purchase/capture-order` | Bearer | Capture an approved PayPal order; credits karma and sends confirmation email |
| POST | `/trips/:id/itinerary` | Bearer | Stream branded `.xlsx`; −1 karma **first export only** (free on repeats — `itinerary_exported_at` guards deduplication) |
| POST | `/ai/suggest` | Bearer | DeepSeek AI trip suggestions (−9 karma) |
| POST | `/ai/plan` | Bearer | DeepSeek AI full itinerary plan (−1 karma) |

## Environment Variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | *(none)* | PostgreSQL connection string, e.g. `postgresql://user:pass@host/db` |
| `JWT_SECRET` | Production | `dev-secret-change-in-production` | Signs/verifies JWTs |
| `RSA_PRIVATE_KEY` | Production | *(none)* | PKCS#8 PEM string with literal `\n`; decrypts login/register payloads. Generate with `node scripts/generate-keys.js`. |
| `FRONTEND_ORIGIN` | Optional | `http://localhost:4200` | CORS allowed origin |
| `EMAIL_HOST` | Production | *(none)* | SMTP server hostname (e.g. `smtp.gmail.com`) |
| `EMAIL_PORT` | Optional | `587` | SMTP port |
| `EMAIL_SECURE` | Optional | `false` | Set to `true` for port 465 (TLS) |
| `EMAIL_USER` | Production | *(none)* | SMTP auth username |
| `EMAIL_PASS` | Production | *(none)* | SMTP auth password |
| `EMAIL_FROM` | Optional | same as `EMAIL_USER` | "From" address shown to recipients |
| `DEEPSEEK_API_KEY` | Production | *(none)* | DeepSeek API key for AI trip suggestions/planning |
| `PAYPAL_CLIENT_ID` | Production | *(none)* | PayPal REST API client ID (from PayPal Developer dashboard) |
| `PAYPAL_CLIENT_SECRET` | Production | *(none)* | PayPal REST API client secret |
| `PAYPAL_MODE` | Optional | `sandbox` | Set to `live` for production payments |

Local overrides go in `local.env` (git-ignored). `api/dotenv-setup.ts` loads it before the app boots; Vercel uses its own environment dashboard in production.

`RSA_PRIVATE_KEY` is only needed for real frontend calls. Integration tests mock `decrypt-payload.middleware` so no key is required locally.

The key **must be PKCS#8 PEM** (the format produced by `generateKeyPairSync`). OpenSSH keys (e.g. from `ssh-keygen`) are not supported by Node's `privateDecrypt` and will cause a `DECODER routines::unsupported` error even after `createPrivateKey()` normalisation.

To generate a compatible key pair:
```bash
node scripts/generate-keys.js
# → prints RSA_PRIVATE_KEY=... line for local.env
# → prints rsaPublicKeyBase64 for the Postman collection variable
```

## Tests

Tests do **not** require a database. Each test file builds an isolated Express app using lightweight stubs from `tests/helpers/stubs.ts` that implement the repository interfaces in memory.

`decrypt-payload.middleware` is mocked in all integration tests:

```typescript
jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));
```

`tests/karma-purchase.test.ts` covers 11 scenarios for the purchase flow. It mocks `src/lib/paypal.ts` (`createPayPalOrder` → `'pp-order-abc123'`, `capturePayPalOrder` → `{ captureId: 'pp-capture-xyz789' }`) so no PayPal credentials are needed locally.

Karma side-effect assertions were removed from the test suite — karma mutations happen inside PostgreSQL triggers and cannot be verified without a real database connection.

> **Known pre-existing failures:** `tests/trips.test.ts` has 3 failing tests (create, update, delete) that existed before the karma purchase feature and are unrelated to it.

## Vercel Deployment

`api/index.ts` exports the Express app as the default export for `@vercel/node`. `vercel.json` routes all traffic to `api/index.ts`. The local dev server only starts when `require.main === module` (i.e. not when imported by Vercel). Set `DATABASE_URL` (and other production vars) in the Vercel project environment settings.
