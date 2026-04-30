# underagegiant-travelbestie-manager

REST API backend for TravelBestie — built with Node.js 20, TypeScript 5, Express 4, and PostgreSQL. Deployed on Vercel Serverless Functions.

## Tech Stack

- **Runtime:** Node.js 20 / TypeScript 5
- **Framework:** Express 4
- **Database:** PostgreSQL 15+ (`pg` driver)
- **Auth:** JWT (`jsonwebtoken`) + RSA-OAEP payload encryption (`bcryptjs`)
- **Deploy:** Vercel Serverless Functions (`@vercel/node`)
- **Tests:** Jest + Supertest (36 tests, no DB required)

## Local Setup

**1. Install dependencies**
```bash
npm install
```

**2. Create `local.env`** (git-ignored)
```env
DATABASE_URL=postgresql://user:pass@host/dbname
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
psql $DATABASE_URL -f ../docs/superpowers/plans/travelbestie-schema.sql
```

**5. Start the dev server**
```bash
npm run dev   # → http://localhost:3000
```

## Commands

```bash
npm run dev        # start dev server (loads local.env)
npm run build      # compile TypeScript → dist/
npm test           # run all 36 tests (no DB needed)
npx jest --watch   # watch mode
```

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register; returns `{ token, user }` |
| POST | `/auth/login` | — | Login; returns `{ token, user }` |
| GET | `/trips` | Bearer | List trips for the authenticated user |
| POST | `/trips` | Bearer | Create trip |
| PUT | `/trips/:id` | Bearer | Update trip (ownership enforced) |
| DELETE | `/trips/:id` | Bearer | Delete trip (ownership enforced) |
| GET | `/comments/:attractionId` | — | Get comments for an attraction |
| POST | `/comments/:attractionId` | Bearer | Add comment |
| GET | `/karma` | Bearer | Get authenticated user's karma score |

Karma is managed entirely by PostgreSQL triggers — no application-level side effects.

## Environment Variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Production | `dev-secret-change-in-production` | Signs/verifies JWTs |
| `RSA_PRIVATE_KEY` | Production | — | PKCS#8 PEM string (use `node scripts/generate-keys.js`); decrypts register/login payloads |
| `FRONTEND_ORIGIN` | Optional | `http://localhost:4200` | CORS allowed origin |

In production, set these in the Vercel project environment settings. Locally, put them in `local.env`.

## Architecture

Middleware-centric pipeline — every route is a chain of named, single-purpose functions:

```
Router → [validate] → [requireAuth?] → [domain middleware…] → [controller] → respond(status)
```

- **Controllers** (`src/controllers/`) call exactly one repository method and attach the result to `req`. Zero business logic.
- **Repositories** (`src/repositories/pg/`) are the only layer that touches PostgreSQL. Injected via `src/container.ts`.
- **`src/lib/db.ts`** exports a single `pg.Pool` driven by `DATABASE_URL`. Loaded after `api/dotenv-setup.ts` runs so the connection string is always populated before the Pool is constructed.
- **Karma** is handled by DB triggers (`trg_trip_karma`, `trg_attraction_comment_karma`) — no middleware needed.

## Deployment

Vercel reads `vercel.json` and routes all traffic to `api/index.ts`, which exports the Express app as the default export for `@vercel/node`.
