# zed-base

Opinionated boilerplate for lightweight Node.js TypeScript microservices.

## Config Module

The config module loads environment variables from `.env` file using `dotenv`.

See `src/config/config.ts` for the `Config` interface and loaded config object.

Copy `.env.example` to `.env` and customize.

## Setup

1. Copy `.env.example` to `.env` and fill in values.
2. Install missing types: `npm install --save-dev @types/node` (required for process.env in TS; also `@types/better-sqlite3` if needed for DB).
3. Run `npm run build` to compile.
4. Note: Other dependencies are already installed: express, morgan, dotenv, typescript, better-sqlite3.
   For dev mode, you may want to install ts-node: `npm install --save-dev ts-node @types/node` (already noted in types).
   tsconfig.json updated with TypeORM decorators + strict options.

The config module is in `src/config/config.ts`.

## Database Module

Added in `src/database/index.ts`: TypeORM `AppDataSource` setup (uses `better-sqlite3` driver for SQLite to match your installed package).
- Prod: only Postgres.
- Dev/Test: supports Postgres, SQLite file (`DB_TYPE=sqlite`), or in-memory (`DB_TYPE=sqlite:memory` for tests).
- Uses `config.isProd()` and `DB_TYPE` from `.env`.
- Entities registered explicitly as classes (ensures metadata for tests/scripts); migration/subscriber globs use `__dirname`.
- Requires: typeorm, pg, better-sqlite3, reflect-metadata (per your deps).

**Additional steps you may need:**
- If SQLite error persists: ensure `better-sqlite3` is in dependencies (you have it); sqlite3 is not required.
- Install DB packages if not done: `npm install typeorm pg better-sqlite3 reflect-metadata` (and `@types/better-sqlite3` if TS issues for driver).
- Run `npm run build` then `npm start` to test DB init (should now succeed with better-sqlite3).

## Demo Models & Migration

Added basic TypeORM entities in `src/entities/` (User, Post, Comment with relations) + sample migration in `src/migrations/InitialMigration.ts` for demo app.

## Test Script

Added `scripts/database/test.ts` to verify inserts/reads across models (uses relations).

**To run test:**
- Set DB_TYPE=sqlite in .env (for quick demo).
- Install ts-node if needed: `npm install --save-dev ts-node`
- Run: `npx ts-node scripts/database/test.ts` (or build + node dist equivalent).

## Router Component

Added in `src/router/{index,types}.ts`: `createRouter(routes)` per spec.
- Takes array of `{route_name, method, endpoint, handler}`.
- Creates Express app, registers routes, wraps handlers to enrich `req.routeName` (for logging; extensible for auth).
- Demo routes in `src/index.ts`; run app to test `/health` and `/api/demo`.

**Additional steps:**
- For full Express features (e.g. cors, rate-limit): `npm install express cors` etc. (base already present).
- Test: `npm run build && npm start` (hits port from config).

## Logger Component

Added in `src/logger/index.ts`: Winston-based structured JSON logger (levels from config.LOG_LEVEL).
- API: `logger.info(req, msg, meta?)` (adds requestId/routeName ONLY for request logs; omits for bootstrap/non-request).
- Request ID: from `X-Request-ID` header or auto-UUID (set in router wrapper FIRST).
- Router wrapper now logs "Request started" + "Request ended (status, duration)" per request.
- Integrated in routes/bootstrap for demo; supports cross-service tracing.

**Additional steps:**
- Winston already in deps; for UUID no extra lib (uses Node crypto).
- Test logs: `npm run build && npm start` then curl /health (check JSON logs with requestId).
