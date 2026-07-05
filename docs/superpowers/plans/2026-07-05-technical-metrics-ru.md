# Technical Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Экспортировать технические метрики Node.js, Fastify API, Telegram-бота и PostgreSQL-запросов в Prometheus format через `prom-client`, чтобы Yandex Unified Agent/Prometheus мог собирать их и отправлять в Monium / Yandex Managed Service for Prometheus.

**Architecture:** Приложение не пушит метрики напрямую в Yandex Cloud. API-процесс и bot-процесс экспонируют `/metrics`, а инфраструктурный агент делает scrape и remote write. Базовые Node.js метрики собираются через `prom-client.collectDefaultMetrics()`, прикладные метрики добавляются вручную с низкокардинальными labels.

**Tech Stack:** Node.js 24, Fastify, grammY, Knex, PostgreSQL, `prom-client`, Prometheus exposition format, Yandex Unified Agent, Yandex Managed Service for Prometheus / Monium.

---

## File Structure

- Modify: `package.json`
  - Добавляет dependency `prom-client`.
- Modify: `package-lock.json`
  - Фиксирует dependency tree.
- Create: `src/observability/metrics.ts`
  - Общий registry, default metrics, custom counters/histograms/gauges.
- Create: `src/api/handlers/metrics-routes.ts`
  - Fastify route `GET /metrics`.
- Modify: `src/api/routes.ts`
  - Регистрирует metrics route.
- Create: `src/api/observability.ts`
  - Fastify hooks для HTTP request counters и duration histograms.
- Modify: `src/index.ts`
  - Подключает Fastify observability hooks.
- Create: `src/bot/metrics-server.ts`
  - Маленький HTTP server для `/metrics` в long-polling bot-процессе.
- Create: `src/bot/observability.ts`
  - grammY middleware для Telegram update metrics.
- Modify: `src/bot/long-polling.ts`
  - Запускает bot metrics server и Telegram metrics middleware.
- Create: `src/db/observability.ts`
  - Helpers для измерения DB operations.
- Modify: repositories incrementally
  - Оборачивает основные DB операции в named metrics без raw SQL labels.
- Create: `test/metrics.routes.test.ts`
  - Проверяет `/metrics` и наличие default Node.js metrics.
- Create: `test/bot.metrics-server.test.ts`
  - Проверяет standalone `/metrics` server для bot-процесса.
- Create: `test/observability.metrics.test.ts`
  - Проверяет HTTP, Telegram и DB metric labels.
- Modify: `docs/architecture-ru.md`
  - Документирует границу observability.
- Modify: `docs/deployment-yandex-cloud.md`
  - Документирует scrape jobs, security и cost controls.

## Naming and Label Rules

Metric prefix:

```text
ion_gift_card_
```

Allowed labels:

```text
method
route
status_class
update_type
command
handler
entity
operation
result
```

Forbidden labels:

```text
telegram_id
provider_user_id
username
card_id
card_code
transaction_id
receipt_id
raw_url
raw_sql
error_message
```

## Task 1: Install prom-client

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install dependency**

Run:

```bash
npm install prom-client
```

Expected: `prom-client` appears in `dependencies` and `package-lock.json` changes.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit dependency**

```bash
git add package.json package-lock.json
git commit -m "Add Prometheus client dependency"
```

## Task 2: Add Metrics Registry and Default Node.js Metrics

**Files:**
- Create: `src/observability/metrics.ts`
- Create: `test/observability.metrics.test.ts`

- [ ] **Step 1: Write failing registry test**

Create `test/observability.metrics.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { metricsRegistry } from '../src/observability/metrics.ts';

test('metrics registry exposes prom-client default node metrics with project prefix', async () => {
  const output = await metricsRegistry.metrics();

  assert.match(output, /ion_gift_card_process_cpu_user_seconds_total/);
  assert.match(output, /ion_gift_card_process_resident_memory_bytes/);
  assert.match(output, /ion_gift_card_nodejs_heap_size_used_bytes/);
  assert.match(output, /ion_gift_card_nodejs_eventloop_lag_seconds/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/observability.metrics.test.ts
```

Expected: FAIL because `src/observability/metrics.ts` does not exist.

- [ ] **Step 3: Implement metrics registry**

Create `src/observability/metrics.ts`:

```ts
import client from 'prom-client';

export const metricsRegistry = new client.Registry();

client.collectDefaultMetrics({
  register: metricsRegistry,
  prefix: 'ion_gift_card_',
});

export const httpRequestsTotal = new client.Counter({
  name: 'ion_gift_card_http_requests_total',
  help: 'Total HTTP requests handled by the API.',
  labelNames: ['method', 'route', 'status_class'] as const,
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'ion_gift_card_http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_class'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const telegramUpdatesTotal = new client.Counter({
  name: 'ion_gift_card_telegram_updates_total',
  help: 'Total Telegram updates processed by the bot.',
  labelNames: ['update_type', 'result'] as const,
  registers: [metricsRegistry],
});

export const telegramUpdateDurationSeconds = new client.Histogram({
  name: 'ion_gift_card_telegram_update_duration_seconds',
  help: 'Telegram update handling duration in seconds.',
  labelNames: ['update_type', 'result'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [metricsRegistry],
});

export const telegramCommandsTotal = new client.Counter({
  name: 'ion_gift_card_telegram_commands_total',
  help: 'Total Telegram bot commands processed by the bot.',
  labelNames: ['command', 'result'] as const,
  registers: [metricsRegistry],
});

export const dbQueriesTotal = new client.Counter({
  name: 'ion_gift_card_db_queries_total',
  help: 'Total database operations.',
  labelNames: ['entity', 'operation', 'result'] as const,
  registers: [metricsRegistry],
});

export const dbQueryDurationSeconds = new client.Histogram({
  name: 'ion_gift_card_db_query_duration_seconds',
  help: 'Database operation duration in seconds.',
  labelNames: ['entity', 'operation', 'result'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [metricsRegistry],
});
```

- [ ] **Step 4: Run registry test**

Run:

```bash
npm test -- test/observability.metrics.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit registry**

```bash
git add src/observability/metrics.ts test/observability.metrics.test.ts
git commit -m "Add Prometheus metrics registry"
```

## Task 3: Expose API /metrics Route

**Files:**
- Create: `src/api/handlers/metrics-routes.ts`
- Modify: `src/api/routes.ts`
- Create: `test/metrics.routes.test.ts`

- [ ] **Step 1: Write failing route test**

Create `test/metrics.routes.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { registerRoutes } from '../src/api/routes.ts';

test('GET /metrics returns Prometheus exposition format', async () => {
  const app = Fastify();
  await registerRoutes(app);

  const response = await app.inject({
    method: 'GET',
    url: '/metrics',
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'] as string, /text\/plain/);
  assert.match(response.body, /ion_gift_card_process_cpu_user_seconds_total/);

  await app.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/metrics.routes.test.ts
```

Expected: FAIL with status `404`.

- [ ] **Step 3: Implement metrics route**

Create `src/api/handlers/metrics-routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { metricsRegistry } from '../../observability/metrics.ts';

export function registerMetricsRoutes(app: FastifyInstance) {
  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });
}
```

Modify `src/api/routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { registerCardRoutes } from './handlers/card-routes.ts';
import { registerHealthRoutes } from './handlers/health-routes.ts';
import { registerMetricsRoutes } from './handlers/metrics-routes.ts';
import { registerQrRoutes } from './handlers/qr-routes.ts';

export async function registerRoutes(app: FastifyInstance) {
  registerQrRoutes(app);
  registerCardRoutes(app);
  registerHealthRoutes(app);
  registerMetricsRoutes(app);
}
```

- [ ] **Step 4: Run route test**

Run:

```bash
npm test -- test/metrics.routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit API metrics route**

```bash
git add src/api/handlers/metrics-routes.ts src/api/routes.ts test/metrics.routes.test.ts
git commit -m "Expose API Prometheus metrics"
```

## Task 4: Add Fastify HTTP Metrics Hooks

**Files:**
- Create: `src/api/observability.ts`
- Modify: `src/index.ts`
- Modify: `test/metrics.routes.test.ts`

- [ ] **Step 1: Extend route test with HTTP metric assertion**

Append to `test/metrics.routes.test.ts`:

```ts
test('HTTP requests are counted with stable route labels', async () => {
  const app = Fastify();
  const { registerApiObservability } = await import('../src/api/observability.ts');

  registerApiObservability(app);
  await registerRoutes(app);

  await app.inject({ method: 'GET', url: '/health' });
  const metrics = await app.inject({ method: 'GET', url: '/metrics' });

  assert.match(metrics.body, /ion_gift_card_http_requests_total\{method="GET",route="\/health",status_class="2xx"\}/);

  await app.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/metrics.routes.test.ts
```

Expected: FAIL because `src/api/observability.ts` does not exist.

- [ ] **Step 3: Implement Fastify hooks**

Create `src/api/observability.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { httpRequestDurationSeconds, httpRequestsTotal } from '../observability/metrics.ts';

function statusClass(statusCode: number) {
  if (statusCode >= 500) return '5xx';
  if (statusCode >= 400) return '4xx';
  if (statusCode >= 300) return '3xx';
  if (statusCode >= 200) return '2xx';
  return '1xx';
}

function routeLabel(request: FastifyRequest) {
  return request.routeOptions.url ?? 'unknown';
}

export function registerApiObservability(app: FastifyInstance) {
  app.addHook('onRequest', async request => {
    request.startTime = process.hrtime.bigint();
  });

  app.addHook('onResponse', async (request, reply) => {
    observeHttpRequest(request, reply);
  });
}

function observeHttpRequest(request: FastifyRequest, reply: FastifyReply) {
  const startedAt = request.startTime;
  if (typeof startedAt !== 'bigint') return;

  const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  const labels = {
    method: request.method,
    route: routeLabel(request),
    status_class: statusClass(reply.statusCode),
  };

  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, durationSeconds);
}

declare module 'fastify' {
  interface FastifyRequest {
    startTime?: bigint;
  }
}
```

Modify `src/index.ts`:

```ts
import Fastify from 'fastify';
import { registerApiObservability } from './api/observability.ts';
import { registerRoutes } from './api/routes.ts';
import { resolveApiListenOptions } from './api/server-config.ts';
import { ConfigurationService } from './configuration/configuration-service.ts';

const app = Fastify({ logger: true });
registerApiObservability(app);

const configurationService = ConfigurationService.fromEnv();
const apiConfig = configurationService.getApiConfig();

const listenOptions = resolveApiListenOptions(apiConfig);

await registerRoutes(app);

try {
  await app.listen(listenOptions);
  console.log(`Server running at http://${listenOptions.host}:${listenOptions.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

- [ ] **Step 4: Run HTTP metrics tests**

Run:

```bash
npm test -- test/metrics.routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit HTTP metrics**

```bash
git add src/api/observability.ts src/index.ts test/metrics.routes.test.ts
git commit -m "Record Fastify HTTP metrics"
```

## Task 5: Add Bot Metrics Server and Telegram Middleware

**Files:**
- Create: `src/bot/metrics-server.ts`
- Create: `src/bot/observability.ts`
- Modify: `src/bot/long-polling.ts`
- Create: `test/bot.metrics-server.test.ts`

- [ ] **Step 1: Write metrics server test**

Create `test/bot.metrics-server.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { startBotMetricsServer } from '../src/bot/metrics-server.ts';

test('bot metrics server exposes Prometheus metrics', async () => {
  const server = await startBotMetricsServer({ host: '127.0.0.1', port: 0 });
  const address = server.address();

  assert.equal(typeof address, 'object');
  assert.notEqual(address, null);

  const response = await fetch(`http://127.0.0.1:${address.port}/metrics`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/plain/);
  assert.match(body, /ion_gift_card_process_cpu_user_seconds_total/);

  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/bot.metrics-server.test.ts
```

Expected: FAIL because `src/bot/metrics-server.ts` does not exist.

- [ ] **Step 3: Implement bot metrics server**

Create `src/bot/metrics-server.ts`:

```ts
import http from 'node:http';
import { metricsRegistry } from '../observability/metrics.ts';

export type BotMetricsServerOptions = {
  host: string;
  port: number;
};

export async function startBotMetricsServer(options: BotMetricsServerOptions) {
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'GET' || request.url !== '/metrics') {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, { 'Content-Type': metricsRegistry.contentType });
    response.end(await metricsRegistry.metrics());
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return server;
}
```

- [ ] **Step 4: Implement Telegram metrics middleware**

Create `src/bot/observability.ts`:

```ts
import type { Context, MiddlewareFn } from 'grammy';
import {
  telegramCommandsTotal,
  telegramUpdateDurationSeconds,
  telegramUpdatesTotal,
} from '../observability/metrics.ts';

function updateType(ctx: Context) {
  if (ctx.message?.web_app_data) return 'web_app_data';
  if (ctx.message?.text?.startsWith('/')) return 'command';
  if (ctx.message) return 'message';
  if (ctx.callbackQuery) return 'callback_query';
  return 'unknown';
}

function commandName(ctx: Context) {
  const text = ctx.message?.text;
  if (!text?.startsWith('/')) return null;
  return text.split(/\s+/, 1)[0].replace('/', '').split('@', 1)[0] || 'unknown';
}

export function telegramMetricsMiddleware(): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const type = updateType(ctx);
    const command = commandName(ctx);
    const startedAt = process.hrtime.bigint();
    let result: 'success' | 'error' = 'success';

    try {
      await next();
    } catch (error) {
      result = 'error';
      throw error;
    } finally {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      telegramUpdatesTotal.inc({ update_type: type, result });
      telegramUpdateDurationSeconds.observe({ update_type: type, result }, durationSeconds);

      if (command) {
        telegramCommandsTotal.inc({ command, result });
      }
    }
  };
}
```

- [ ] **Step 5: Wire middleware and metrics server into long-polling entrypoint**

Modify `src/bot/long-polling.ts` so that before `bot.start()` it:

```ts
import { startBotMetricsServer } from './metrics-server.ts';
import { telegramMetricsMiddleware } from './observability.ts';

const metricsPort = Number(process.env.BOT_METRICS_PORT ?? 9101);
const metricsHost = process.env.BOT_METRICS_HOST ?? '127.0.0.1';

bot.use(telegramMetricsMiddleware());
await startBotMetricsServer({ host: metricsHost, port: metricsPort });
```

Keep the existing bot creation and startup code intact.

- [ ] **Step 6: Run bot metrics tests**

Run:

```bash
npm test -- test/bot.metrics-server.test.ts test/observability.metrics.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit bot metrics**

```bash
git add src/bot/metrics-server.ts src/bot/observability.ts src/bot/long-polling.ts test/bot.metrics-server.test.ts
git commit -m "Expose Telegram bot Prometheus metrics"
```

## Task 6: Add DB Operation Metrics Helpers

**Files:**
- Create: `src/db/observability.ts`
- Modify: selected repository files incrementally
- Modify: `test/observability.metrics.test.ts`

- [ ] **Step 1: Add test for DB metrics helper**

Append to `test/observability.metrics.test.ts`:

```ts
test('database operation helper records success and error labels', async () => {
  const { observeDbOperation } = await import('../src/db/observability.ts');

  await observeDbOperation('cards', 'select', async () => 'ok');

  await assert.rejects(
    () => observeDbOperation('cards', 'insert', async () => {
      throw new Error('boom');
    }),
    /boom/,
  );

  const output = await metricsRegistry.metrics();
  assert.match(output, /ion_gift_card_db_queries_total\{entity="cards",operation="select",result="success"\}/);
  assert.match(output, /ion_gift_card_db_queries_total\{entity="cards",operation="insert",result="error"\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/observability.metrics.test.ts
```

Expected: FAIL because `src/db/observability.ts` does not exist.

- [ ] **Step 3: Implement DB metrics helper**

Create `src/db/observability.ts`:

```ts
import { dbQueriesTotal, dbQueryDurationSeconds } from '../observability/metrics.ts';

export type DbMetricEntity =
  | 'cards'
  | 'transactions'
  | 'transaction_receipts'
  | 'customers'
  | 'customer_identities'
  | 'card_owners'
  | 'card_transfers'
  | 'operators';

export type DbMetricOperation = 'select' | 'insert' | 'update' | 'delete' | 'transaction';

export async function observeDbOperation<T>(
  entity: DbMetricEntity,
  operation: DbMetricOperation,
  callback: () => Promise<T>,
): Promise<T> {
  const startedAt = process.hrtime.bigint();
  let result: 'success' | 'error' = 'success';

  try {
    return await callback();
  } catch (error) {
    result = 'error';
    throw error;
  } finally {
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    const labels = { entity, operation, result };
    dbQueriesTotal.inc(labels);
    dbQueryDurationSeconds.observe(labels, durationSeconds);
  }
}
```

- [ ] **Step 4: Run helper test**

Run:

```bash
npm test -- test/observability.metrics.test.ts
```

Expected: PASS.

- [ ] **Step 5: Instrument one low-risk repository first**

Modify `src/repositories/card.repository.ts` by wrapping public DB methods with:

```ts
return observeDbOperation('cards', 'select', async () => {
  return db('cards').where({ code }).first();
});
```

Use:

```text
cards/select
cards/insert
cards/update
transactions/insert
transaction_receipts/select
transaction_receipts/insert
customers/select
customers/insert
card_owners/select
card_owners/insert
card_transfers/select
card_transfers/insert
operators/select
```

Do not label by SQL text, card code or IDs.

- [ ] **Step 6: Run repository tests after each repository**

Run after each touched repository:

```bash
npm test -- test/card.use-cases.test.ts test/transaction.repository.test.ts test/customer.repository.test.ts test/operator.repository.test.ts test/transaction-receipt.repository.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit DB metrics**

```bash
git add src/db/observability.ts src/repositories test/observability.metrics.test.ts
git commit -m "Record database operation metrics"
```

## Task 7: Document Prometheus Scraping in Yandex Cloud

**Files:**
- Modify: `docs/architecture-ru.md`
- Modify: `docs/deployment-yandex-cloud.md`

- [ ] **Step 1: Update architecture docs**

Append to `docs/architecture-ru.md`:

~~~md
## Технические метрики

Технические метрики экспортируются в Prometheus exposition format через `prom-client`. Приложение не отправляет метрики напрямую в Yandex Cloud: API и bot процессы публикуют `/metrics`, а Yandex Unified Agent или Prometheus agent выполняет scrape и remote write в Yandex Managed Service for Prometheus / Monium.

Default Node.js метрики собираются через `collectDefaultMetrics()` с префиксом `ion_gift_card_`. Прикладные labels должны быть низкокардинальными. Запрещено использовать `telegram_id`, `card_id`, `card_code`, `transaction_id`, raw SQL, URL с параметрами и текст ошибки как label.
~~~

- [ ] **Step 2: Update deployment docs**

Append to `docs/deployment-yandex-cloud.md`:

~~~md
## Prometheus metrics для Monium / Managed Service for Prometheus

API процесс публикует:

```text
GET /metrics
```

Bot long-polling процесс публикует:

```text
GET /metrics на BOT_METRICS_HOST:BOT_METRICS_PORT
```

Рекомендуемые значения:

```text
BOT_METRICS_HOST=127.0.0.1
BOT_METRICS_PORT=9101
```

Пример scrape jobs для Yandex Unified Agent:

```json
{
  "jobs": [
    {
      "job_name": "ion_gift_card_api",
      "scrape_interval": "60s",
      "scrape_timeout": "5s",
      "metrics_path": "/metrics",
      "targets": [{ "port": 3000 }]
    },
    {
      "job_name": "ion_gift_card_bot",
      "scrape_interval": "60s",
      "scrape_timeout": "5s",
      "metrics_path": "/metrics",
      "targets": [{ "port": 9101 }]
    }
  ]
}
```

Для дешевой эксплуатации начинать со `scrape_interval=60s`. Переходить на `15s` только для метрик, по которым реально нужны быстрые алерты.

`/metrics` не должен быть открыт в публичный интернет. Разрешить доступ только локальному агенту, внутренней сети или security group агента.
~~~

- [ ] **Step 3: Run tests**

Run:

```bash
npm test -- test/metrics.routes.test.ts test/bot.metrics-server.test.ts test/observability.metrics.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit docs**

```bash
git add docs/architecture-ru.md docs/deployment-yandex-cloud.md
git commit -m "Document Prometheus metrics setup"
```

## Task 8: Configure Monium / Managed Prometheus Dashboards and Alerts

**Files:**
- No repository files.

- [ ] **Step 1: Configure scrape and remote write**

In Yandex Cloud:

1. Create or select a Monitoring workspace.
2. Ensure the VM service account has `monitoring.editor`.
3. Install or update Yandex Unified Agent with Prometheus scraping enabled.
4. Add scrape jobs for API and bot.
5. Confirm metrics exist with PromQL:

```promql
{job="ion_gift_card_api", __name__="ion_gift_card_nodejs_heap_size_used_bytes"}
{job="ion_gift_card_bot", __name__="ion_gift_card_telegram_updates_total"}
```

- [ ] **Step 2: Create dashboards**

Create panels:

```text
Node.js Runtime:
- CPU user/system
- RSS memory
- heap used / heap total
- event loop lag p95/p99
- GC duration
- process uptime

API:
- request rate
- p95/p99 duration
- 4xx/5xx by route

Telegram:
- updates per minute
- command count by command/result
- update duration p95/p99
- handler errors

Database:
- DB query count by entity/operation/result
- DB query duration p95/p99
- DB errors
```

- [ ] **Step 3: Create low-cost alerts**

Create alerts:

```text
API down: up{job="ion_gift_card_api"} == 0 for 3m
Bot metrics down: up{job="ion_gift_card_bot"} == 0 for 3m
High event loop lag: p99 event loop lag > 0.5s for 5m
High heap usage: heap used / heap total > 0.85 for 10m
HTTP 5xx: 5xx requests > threshold for 5m
DB errors: db_queries_total{result="error"} increases over 5m
Slow DB: p95 db duration > 0.5s for 10m
Telegram errors: telegram_updates_total{result="error"} increases over 5m
```

- [ ] **Step 4: Verify cost controls**

Confirm:

```text
scrape_interval is 60s for API and bot.
No high-cardinality labels are present.
No logs are shipped to Monium Logs in this plan.
No traces are shipped to Monium Traces in this plan.
Alert count is limited to production-critical signals.
```

## Verification

- [ ] `npm install prom-client`
- [ ] `npm run typecheck`
- [ ] `npm test -- test/observability.metrics.test.ts`
- [ ] `npm test -- test/metrics.routes.test.ts`
- [ ] `npm test -- test/bot.metrics-server.test.ts`
- [ ] `npm test`
- [ ] `/metrics` contains `ion_gift_card_nodejs_heap_size_used_bytes`.
- [ ] `/metrics` contains no raw card codes, Telegram IDs, transaction IDs or SQL text.
- [ ] Yandex Unified Agent successfully scrapes API and bot metrics.
