# underagegiant-travelbestie-manager

REST API backend for TravelBestie — built with Node.js 24, TypeScript 5, Express 4, and PostgreSQL. Deployed on Vercel Serverless Functions.

## Tech Stack

- **Runtime:** Node.js 24 / TypeScript 5
- **Framework:** Express 4
- **Database:** PostgreSQL 15+ (`pg` driver)
- **Cache / sessions:** Redis (`ioredis`) — rate limiting, refresh-token sessions, OTP, AI plan-change sessions, notification-status cache, companion boost
- **Auth:** short-lived access JWT (`jsonwebtoken`) + rotating refresh token in an HttpOnly cookie; RSA-OAEP encrypted login/register payloads; `bcryptjs` password hashes
- **Email:** `nodemailer` — OTP, karma purchase receipts, collaborator invites
- **AI:** DeepSeek (OpenAI-compatible SDK) — trip suggestions/planning
- **Payments:** PayPal (`src/lib/paypal.ts`) and MercadoPago (`src/lib/mercadopago.ts`) on a provider-neutral purchase schema
- **Deploy:** Vercel Serverless Functions (`@vercel/node`)
- **Tests:** Jest + Supertest — no DB required (repositories are stubbed in-memory); run `npm test` for current pass/fail counts

## Local Setup

**1. Install dependencies**
```bash
npm install
```

**2. Create `local.env`** (git-ignored): `cp local.env.example local.env`, then set at least
```env
POSTGRES_URL_NO_SSL=postgresql://user:pass@host/dbname
JWT_SECRET=any-local-secret
RSA_PRIVATE_KEY=<output from step 3>
FRONTEND_ORIGIN=http://localhost:4200
```

**3. Generate an RSA key pair** for Postman / frontend encryption
```bash
node scripts/generate-keys.js
# Copy the RSA_PRIVATE_KEY=... line into local.env
# Copy the rsaPublicKeyBase64 value into the Postman collection variable
```

**4. Apply the schema** to your PostgreSQL database
```bash
psql $POSTGRES_URL_NO_SSL -f ../docs/superpowers/plans/travelbestie-schema.sql
```

**5. Start the dev server**
```bash
npm run dev   # → http://localhost:3000
```

## Commands

```bash
npm run dev                          # start dev server (loads local.env; no file watching, restart after changes)
npm run build                        # compile TypeScript → dist/
npm test                             # run the full test suite (no DB needed)
npx jest tests/karma-purchase.test.ts  # run a single test file
npx jest --watch                     # watch mode
npx jest --testNamePattern "karma"   # run tests matching a pattern
```

## API

Full request/response contracts live in `docs/superpowers/plans/2026-04-28-backend-endpoint-contracts.md` (in the monorepo root). This is a quick-reference index, grouped by resource. User-facing copy calls karma "Token"; the code, database and API say `karma`.

| Method | Path | Auth | Description |
|---|---|---|---|
| **Auth** | | | |
| POST | `/auth/request-otp` | — | Email a 6-digit registration OTP |
| POST | `/auth/register` | — | Verify OTP → create account (karma = 10) → `{ token, user }` + refresh-token cookie |
| POST | `/auth/login` | — | `{ token, user }` + refresh-token cookie (HttpOnly; never in the body) |
| POST | `/auth/refresh` | cookie | Rotate the refresh token → new access JWT |
| POST | `/auth/logout` | Bearer | Revoke refresh token |
| POST | `/auth/request-profile-otp` | Bearer | Email an OTP to confirm an email change |
| PUT | `/auth/profile` | Bearer | Update name / email (OTP-verified) / password / home city |
| POST | `/auth/request-password-reset`, `/auth/reset-password` | — | Forgot-password flow |
| **Trips** | | | |
| GET | `/trips` | Bearer | List own trips + accepted collaborations |
| POST | `/trips` | Bearer | Create trip (−1 karma) |
| PUT | `/trips/:id` | Bearer | Update trip — owner **or** an accepted collaborator |
| DELETE | `/trips/:id` | Bearer | Delete trip (owner only) |
| POST | `/trips/:id/share` | Bearer | Share trip → `{ shareId }` (free) |
| POST | `/trips/:id/clone`, `/shared/:shareId/clone` | Bearer | Duplicate a trip (−1 karma) |
| POST | `/trips/:id/itinerary` | Bearer | Stream a branded `.xlsx` itinerary (−1 karma, first export only) |
| **Trip collaborators** (Feature 16) | | | |
| POST | `/trips/:id/collaborators` | Bearer | Invite a collaborator by email (owner only, −1 karma) |
| POST | `/trips/:id/collaborators/accept` | Bearer | Accept a pending invite |
| DELETE | `/trips/:id/collaborators/:userId` | Bearer | Remove a collaborator (owner only) |
| GET | `/trips/:id/collaborators`, `/trips/invites` | Bearer | List a trip's collaborators / your pending invites |
| **Comments & karma** | | | |
| GET | `/comments`, `/comments/:attractionId` | — | Batch or single attraction comments |
| POST | `/comments/:attractionId` | Bearer | Add comment (+1 karma on first comment per attraction) |
| GET | `/karma`, `/karma/packages` | Bearer | Balance / purchasable packages |
| GET | `/karma/events` | Bearer | Karma history (keyset-paginated) |
| POST | `/karma/purchase/create-order`, `/karma/purchase/capture-order` | Bearer | PayPal karma purchase flow |
| POST | `/karma/purchase/mp/create-preference` | Bearer | Start a MercadoPago purchase |
| POST | `/karma/purchase/mp/webhook` | signature | MercadoPago payment notification |
| GET | `/karma/purchase/mp/status/:purchaseRef` | Bearer | Poll a MercadoPago purchase |
| **AI (DeepSeek)** | | | |
| POST | `/ai/suggest` | Bearer | 2 trip options (−8 karma) |
| POST | `/ai/plan` | Bearer | Start a full-itinerary job (−1 karma; free for minor re-plans) |
| GET | `/ai/plan/:requestId/status`, `/ai/plan/history` | Bearer | Poll a plan job / list past jobs |
| DELETE | `/ai/plan/:requestId` | Bearer | Discard a plan job |
| POST | `/ai/suggest-attractions` | Bearer | 3–5 more attractions for one city (−2 karma, free on follow-up) |
| POST | `/ai/suggest-companion` | Bearer | Unprompted single-attraction nudge (free, rate-limited) |
| POST | `/companion/boost`, `GET /companion/status` | Bearer | Raise the nudge chance for 24 h (−2 karma) |
| **Shared trips, landing & SEO** | | | |
| GET | `/shared?q=`, `/shared/:shareId` | — | Search / view shared trips |
| GET | `/favorites` | Bearer | Favorited shared trips |
| GET | `/featured`, `/stats` | — | Landing-page data (Redis-cached) |
| GET | `/feed`, `/feed/following` | Bearer | Landing feed / trips from followed users |
| GET | `/seo/sitemap`, `/seo/shared/:shareId`, `/seo/city/:cityId/plans` | — | Data for the sitemap, share previews and city guides |
| **Social & gamification** | | | |
| GET | `/u/:username` | — | Public profile |
| POST / DELETE | `/users/:username/follow` | Bearer | Follow / unfollow |
| GET | `/trophies` | Bearer | Trophy shelf |
| GET | `/rankings`, `/rankings/me` | Bearer | Weekly ranking / own position |
| POST | `/game/runs`, `/game/runs/:runId/finish` | Bearer | Miel Runner mini-game runs |
| **Other** | | | |
| GET | `/weather`, `/fx/rates` | — | Forecast for a stop / exchange rates |
| GET / POST | `/highlights/:type/status`, `/seen`, `/dismiss` | optional | Onboarding-tour state |
| GET | `/notifications`, `/notifications/status` | Bearer | In-app notification bell |
| POST | `/notifications/read`, `PUT /notifications/mute` | Bearer | Mark read / mute |

Every karma change is applied in application code (`KarmaController` middleware, plus the first-comment award middleware) and writes one `karma_events` row. There are no database triggers.

## Environment Variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `POSTGRES_URL_NO_SSL` | Yes | — | PostgreSQL (PgBouncer) URL without SSL params; `src/lib/db.ts` appends `?channel_binding=require&sslmode=verify-full` |
| `JWT_SECRET` | Production | `dev-secret-change-in-production` | Signs/verifies JWTs |
| `JWT_EXPIRES_IN` | Optional | `2h` | Access token TTL |
| `RSA_PRIVATE_KEY` | Production | — | PKCS#8 PEM string (use `node scripts/generate-keys.js`); decrypts register/login payloads |
| `FRONTEND_ORIGIN` | Optional | `http://localhost:4200` | CORS allowed origin |
| `REDIS_URL` | Production | — | Rate limiting, OTP, AI plan sessions, notification cache, companion boost. Degrades gracefully (fail-open / `new_session` fallback) if absent |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_SECURE` / `EMAIL_USER` / `EMAIL_PASS` / `EMAIL_FROM` | Production | — | SMTP config for OTP, receipts, and collaborator-invite emails |
| `DEEPSEEK_API_KEY` | Production | — | Powers `/ai/suggest`, `/ai/plan`, `/ai/suggest-attractions`, `/ai/suggest-companion` |
| `FEATURED_TRIP_IDS` | Optional | — | Comma-separated `shareId`s shown on the landing page |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_MODE` | Production | `PAYPAL_MODE`: sandbox | PayPal karma purchases; `PAYPAL_MODE=live` uses the live API, anything else the sandbox |
| `MERCADOPAGO_ACCESS_TOKEN` / `MERCADOPAGO_WEBHOOK_SECRET` / `MERCADOPAGO_NOTIFICATION_URL` | Production | — | MercadoPago karma purchases |
| `HIGHLIGHT_SEEN_TTL_SECONDS` | Optional | `86400` | How long a "seen" highlight flag lives in Redis |
| `COMPANION_SUGGEST_CHANCE` / `COMPANION_SUGGEST_CHANCE_BOOSTED` / `COMPANION_BOOST_DURATION_SECONDS` | Optional | `0.20` / `0.75` / `86400` | Companion suggestion odds and boost duration |

In production, set these in the Vercel project environment settings. Locally, `cp local.env.example local.env` and fill in what you need; `local.env.example` lists every variable the code reads (a test keeps it complete). `RSA_PRIVATE_KEY` is only needed for real frontend calls — integration tests mock the decrypt middleware, and Redis/email/DeepSeek/PayPal vars are only needed to exercise those specific features locally (`npm test` needs none of them).

## Architecture

Middleware-centric pipeline — every route is a chain of named, single-purpose functions:

```
Router → [rateLimit] → [validate] → [requireAuth?] → [domain middleware…] → [controller] → [side effects…] → respond(status)
```

```
underagegiant-travelbestie-manager/
├── api/
│   ├── dotenv-setup.ts                  # loads local.env — imported first, before anything touches src/
│   └── index.ts                         # exports the Express app; @vercel/node's entry point
├── src/
│   ├── app.ts                           # assembles the Express app, mounts every router
│   ├── container.ts                     # composition root — the only file that imports concrete Pg* repos
│   ├── types.ts                         # domain types, shared unchanged across repos → controllers → middleware → routes
│   ├── controllers/                     # one file per resource — thin adapters: repo call → req.result → next()
│   ├── middleware/                      # all business logic, grouped by domain
│   │   ├── auth/                        # OTP, JWT, refresh tokens, profile changes
│   │   ├── ai/                          # plan-change session tracking, companion roll
│   │   ├── collaborators/               # invite validation, edit-access check (Feature 16)
│   │   ├── comments/                    # cooldown, similarity check, batch cache
│   │   ├── favorites/                   # shared-trip favoriting
│   │   ├── karma/                       # purchase validation, confirmation email
│   │   ├── notifications/               # one notify-*.middleware.ts per trigger type
│   │   ├── shared-comments/             # step comments on shared trips
│   │   ├── trips/                       # ownership/edit-access, itinerary export, cloning
│   │   ├── rate-limit.middleware.ts     # generic Redis sliding-window limiter
│   │   ├── request-logger.middleware.ts # assigns req.flowId, logs every request
│   │   └── respond.middleware.ts        # terminal step of every route chain
│   ├── repositories/
│   │   ├── interfaces/                  # I*Repository contracts — what tests stub against
│   │   └── pg/                          # Postgres implementations — the only layer touching pg.Pool
│   ├── routes/                          # one file per resource, wires the middleware chains together
│   ├── schemas/                         # zod request-body validation, one file per resource
│   ├── lib/                             # framework-agnostic helpers: db, redis, jwt, email, deepseek, paypal, mercadopago, logger…
│   ├── data/                            # static city lookup data
│   └── templates/                       # HTML email templates + the XLSX itinerary base template
├── prompts/
│   └── ai-trip-prompts.json             # DeepSeek system/user prompt templates (suggest, plan, suggestAttractions)
├── scripts/
│   └── generate-keys.js                 # generates an RSA keypair for local RSA-OAEP payload decryption
├── tests/                               # Jest + Supertest, roughly one file per feature or route group
│   ├── helpers/stubs.ts                 # in-memory Stub*Repository implementations — no DB needed to run tests
│   └── lib/                             # unit tests for src/lib/ helpers
├── jest.config.ts
├── tsconfig.json
├── vercel.json                          # routes all traffic to api/index.ts
└── package.json
```

- **Controllers** (`src/controllers/`) call exactly one repository method and attach the result to `req`. Zero business logic.
- **Repositories** (`src/repositories/pg/`) are the only layer that touches PostgreSQL. Injected via `src/container.ts`.
- **`src/lib/db.ts`** exports a single `pg.Pool` driven by `POSTGRES_URL_NO_SSL`. Loaded after `api/dotenv-setup.ts` runs so the connection string is always populated before the Pool is constructed.
- **Karma** costs are named constants in `src/controllers/karma.controller.ts`; routes gate with `requireKarma` and charge with `spendFor*` middleware after the action succeeds. No database triggers.
- **Redis is fail-open**: an outage falls back to the database or a default. The exceptions are refresh-token sessions and Miel Runner runs, which live only in Redis.

## Deployment

Vercel reads `vercel.json` and routes all traffic to `api/index.ts`, which exports the Express app as the default export for `@vercel/node`.
