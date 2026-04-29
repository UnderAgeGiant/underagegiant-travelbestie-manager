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
| `PgKarmaRepository` | `users.karma` (read-only; mutations are trigger-managed) |

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

> Karma side-effect middleware was removed — both `apply-karma-on-trip` and `apply-karma-on-comment` are now handled by PostgreSQL triggers.

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

## Environment Variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | *(none)* | PostgreSQL connection string, e.g. `postgresql://user:pass@host/db` |
| `JWT_SECRET` | Production | `dev-secret-change-in-production` | Signs/verifies JWTs |
| `RSA_PRIVATE_KEY` | Production | *(none)* | PEM string with `\n` as literal `\n`; decrypts login/register payloads |
| `FRONTEND_ORIGIN` | Optional | `http://localhost:4200` | CORS allowed origin |

Local overrides go in `local.env` (git-ignored). The dev server loads it automatically via `dotenv`; Vercel uses its own environment dashboard in production.

`RSA_PRIVATE_KEY` is only needed for real frontend calls. Integration tests mock `decrypt-payload.middleware` so no key is required locally.

## Tests

Tests do **not** require a database. Each test file builds an isolated Express app using lightweight stubs from `tests/helpers/stubs.ts` that implement the repository interfaces in memory.

`decrypt-payload.middleware` is mocked in all integration tests:

```typescript
jest.mock('../src/middleware/auth/decrypt-payload.middleware', () => ({
  decryptPayloadMiddleware: (_req: any, _res: any, next: any) => next(),
}));
```

Karma side-effect assertions were removed from the test suite — karma mutations happen inside PostgreSQL triggers and cannot be verified without a real database connection.

## Vercel Deployment

`api/index.ts` exports the Express app as the default export for `@vercel/node`. `vercel.json` routes all traffic to `api/index.ts`. The local dev server only starts when `require.main === module` (i.e. not when imported by Vercel). Set `DATABASE_URL` (and other production vars) in the Vercel project environment settings.
