# zed-base

Opinionated boilerplate for lightweight Node.js TypeScript microservices. Fork this to build your service – it provides reusable components for config, database, routing, logging, and HTTP clients.

## Getting Started

1. Copy `.env.example` to `.env` and customize values (e.g. `DB_TYPE`, DB creds, `LOG_LEVEL`).
2. Run `npm run build` to compile TypeScript.
3. Run `npm start` to launch the app (uses `src/index.ts` bootstrap).

Extend by adding your entities, routes, business logic. Use `npm run build` for production builds.

## Config

Import the loaded config and helpers:

```ts
import { config, isProd } from './config/config';

console.log(config.PORT);  // e.g. 3000
if (isProd()) {
  // Prod-only logic (forces Postgres etc.)
}
```

See `src/config/config.ts` for full `Config` interface (NODE_ENV, DB_*, LOG_LEVEL, etc.) and `.env` loading.

## Database

Use TypeORM `AppDataSource` for DB ops (Postgres in prod; SQLite options in dev/test):

```ts
import { AppDataSource } from './database';
import { Workflow } from './entities/Workflow';  // Your entities here

await AppDataSource.initialize();

// Example query
const workflowRepo = AppDataSource.getRepository(Workflow);
const workflows = await workflowRepo.find();
```

- Add entities to `src/entities/` (decorators).
- Migrations in `src/migrations/` (extend `InitialMigration` or generate via TypeORM).
- Config-driven: `DB_TYPE=sqlite` (or `:memory:`) in dev; Postgres always in prod via `config.isProd()`.

See `src/database/index.ts`.

## Router

Define routes and create Express app:

```ts
import { createRouter, type Route } from './router';

const routes: Route[] = [
  {
    route_name: 'health_check',
    method: 'GET',
    endpoint: '/health',
    handler: (req, res) => {
      res.json({ status: 'ok' });
    },
  },
  // Add your routes...
];

const app = createRouter(routes);
// app is standard Express instance; add middleware as needed
```

- Handlers receive enriched `req` (with `routeName`, `requestId`).
- Extend wrapper in `src/router/index.ts` for auth etc.
- See `src/router/types.ts` for `Route` interface.

## Logger

Structured JSON logging (Winston, levels from `config.LOG_LEVEL`):

```ts
import { logger } from './logger';

// In request handlers (req provides requestId/routeName):
logger.info(req, 'Operation completed', { userId: 123 });
logger.error(req, 'Failed to process', { error: err.message });

// Non-request (e.g. startup):
logger.info({} as any, 'App started');
```

- Auto-traces via `requestId` (propagated from `X-Request-ID` header or UUID).
- Request wrapper auto-logs start/end (status, duration).
- See `src/logger/index.ts`.

## HttpClient

For outbound calls to other services:

```ts
import { HttpClient } from './httpclient';

const client = new HttpClient({
  baseUrl: 'https://other-service.example.com',
  timeout: 5000,
  retryCount: 2,
  propagateHeaders: ['x-request-id', 'authorization'],  // From current req
  headers: { 'X-API-Key': 'secret' },  // Common
});

// In handler:
const data = await client.get(req, '/api/users', { 'Custom-Header': 'value' });
await client.post(req, '/api/posts', { title: 'New' });
```

- Logs outbound requests/responses/errors (with latency, status).
- Retries timeouts; throws on 4xx; per-request options supported.
- See `src/httpclient/{index,types}.ts` for full API.

