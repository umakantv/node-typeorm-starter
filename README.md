# Approval Workflows Microservice

This microservice manages role-based, multi-level approval workflows. Each workflow defines approval levels with allowed roles and required counts. ApprovalTasks are created for resources and progress through levels via approve/reject/discard actions. All endpoints are protected by service auth headers (`x-account-type: service`, `x-account-id`).

**Key features:**
- Workflows (create/update/list) with sequential approval levels.
- ApprovalTasks (create/list/get/approve/reject/discard) with status tracking, history, and computed `nextReviewRoles`.
- Role-based verification for actions; action history in JSON (includes reviewer, actionType, levels, statuses, optional comment, timestamp).
- Bulk discard support.
- TypeORM DB (Postgres prod, SQLite dev); auth/ownership enforced.

## API Endpoints

All require headers:
- `x-account-type: service`
- `x-account-id: <client-id>`
- Optional `x-request-id` for tracing.

### Workflows
- `GET /workflows` - List (with query filters, pagination).
- `POST /workflows` - Create (with approvals array; levels must be consecutive).
- `PATCH /workflows/:id` - Update (name/enabled).

### Approval Tasks
- `POST /approval-tasks` - Create for a workflow/resource.
- `POST /approval-tasks/bulk` - Bulk create (body: `{workflowId, resourceIds: []}`; validates workflow once, batch DB save + relations load; returns array of tasks with `nextReviewRoles`).
- `GET /approval-tasks` - List (filters: status, workflowId, etc.; pagination).
- `GET /approval-tasks/:id` - Get details (with workflow/approvals/history).
- `POST /approval-tasks/:id/approve` - Approve current level (body: `{reviewerId, reviewerRoles, comment?}`; advances level or completes; 403 on role mismatch).
- `POST /approval-tasks/:id/reject` - Reject (body: `{reviewerId, reviewerRoles, comment}`; level 1 rejects fully, else decrements; history includes comment).
- `POST /approval-tasks/discard` - Bulk discard (body: `{taskIds: [], reviewerId, reviewerRoles, comment?}`; sets Discarded, records history per task; returns successes/errors).

Responses include computed `nextReviewRoles` (from workflow config) and full `actionHistory`.

## Entities & Logic
- **Workflow**: Defines enabled approval levels (allowedRoles, approvalCountsRequired).
- **ApprovalTask**: Tracks status (Pending/InProgress/Completed/Rejected/Discarded), nextReviewLevel, actionHistory JSON.
- Actions verify roles at current level; history logs all details.
- See `src/entities/*` and `src/controllers/workflows.ts` for impl.

## Getting Started

1. Copy `.env.example` to `.env` (DB creds, etc.).
2. `npm run build` (TypeScript compile).
3. `npm start` (bootstraps DB + server on PORT).

See `src/index.ts` for routes, `src/controllers/workflows.ts` for handlers. Extend with reject strategies in workflow config later.

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

