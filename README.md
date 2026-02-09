# Webhooks Microservice

This microservice implements a pub-sub model for webhooks: services register (subscribe) to resources/events, and triggers publish to matching webhook endpoints. Supports registration, search/patch, triggers with tracking (runs + per-execution details), and reporting APIs. Built with TypeORM (Postgres prod / SQLite dev), Express, structured logging, and retrying HTTP client.

## Features
- **Register webhooks**: Subscribe to resourceType/resourceId with owner, URL, timeouts, headers.
- **Trigger webhooks**: Fire to enabled matching subscriptions (accept optional headers merged to requests); tracks runs/executions (success/fail, status, response, timings). Supports manual + scheduled (cron) triggers.
- **Reporting**: Paginated searches for webhooks, runs (with success/failure counts), executions.
- **Config-driven**: Env-based (DB, logs); prod forces Postgres.
- **Tracing/Logging**: Auto requestId propagation + JSON logs.
- **DB**: Entities + manual migrations; synchronize in dev.

## Setup
1. Copy `.env.example` to `.env` (set DB creds, `DB_TYPE=sqlite` for dev, `LOG_LEVEL=info`).
2. `npm run build` (TS compile).
3. `npm start` (starts on PORT=3000; inits DB/migrations).

See `src/config/config.ts`, `src/database/index.ts`.

## APIs (all JSON; enriched req with requestId/routeName)
- **POST /api/webhooks/register**: Register webhook (required: resourceType, resourceId, owner*, webhookUrl, etc).
- **POST /api/webhooks/search**: Paginated search webhooks (filters: id, resource*, owner*, enabled; pagination: limit, offset, orderBy, orderByDir).
- **PATCH /api/webhooks/:id**: Update webhook.
- **POST /api/webhooks/trigger**: Trigger for resource (content + optional headers + triggeredBy); auto-tracks run/execs (408 for timeouts). Trigger headers merged into webhook headers (trigger overrides).
- **POST /api/webhooks/schedules**: Create schedule for webhook (webhookId, frequency=cron5field, content; optional enabled/endAt/triggeredBy; auto-sets nextRunAt).
- **PATCH /api/webhooks/schedules/:id**: Update schedule (recomputes nextRunAt if freq changes).
- **POST /api/webhooks/runs**: Paginated runs search (filters: resourceType/resourceId; + counts/orderBy).
- **POST /api/webhooks/executions**: Paginated executions search (filters: webhookRunId, result, statusCode, etc).
- **GET /health**, **/api/demo** (tests), test endpoints.

See `src/controllers/webhooks.ts`, `src/index.ts` (routes), `src/router/`.

## Entities (src/entities/)
- **RegisteredWebhook**: Subscription details (id, resource*, owner*, url, headers, timeouts, enabled).
- **WebhookRun**: Trigger batch (id, resource*, content, headers, triggeredAt/By, completedAt).
- **WebhookExecution**: Per-webhook outcome (id, runId/webhookId, result, statusCode, response, timings).
- **Schedule**: Cron auto-trigger (id, webhookId, frequency=cron, content, enabled, endAt?, triggeredBy?, nextRunAt, lastRunAt?); multiple OK per webhook.

Migrations in `src/migrations/` (run via TypeORM).

## Other Components
- **Logger**: `src/logger/` (Winston; auto-traces).
- **HttpClient**: `src/httpclient/` (retries, logging, header prop).
- **DB**: TypeORM; see `scripts/database/test.ts` for examples.

Prod: Postgres only; graceful shutdown. Extend for auth, more triggers.

