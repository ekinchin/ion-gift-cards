# Yandex Cloud Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare tag-based production deployment to Yandex Cloud with separate API, bot webhook, and migration images.

**Architecture:** Keep the existing modular monolith and one Dockerfile, but split runtime entrypoints so API and Telegram webhook bot can run as independent Yandex Serverless Containers. Use Managed PostgreSQL for data, Lockbox for runtime secrets, Container Registry for immutable images, and GitHub Actions for release orchestration.

**Tech Stack:** Node.js 24 strip-types, TypeScript, Fastify, grammY, Knex, PostgreSQL, Docker, GitHub Actions, Yandex Cloud Serverless Containers, Yandex Container Registry, Yandex Lockbox.

---

## File Structure

- Modify `src/index.ts`: read `PORT` before `API_PORT`.
- Modify `knexfile.ts`: reduce default serverless pool pressure while preserving test/local behavior.
- Refactor `src/bot/index.ts`: move bot construction and command registration into reusable exports.
- Create `src/bot/long-polling.ts`: current local bot startup with `bot.start()`.
- Create `src/bot/webhook.ts`: Fastify webhook runtime for Yandex Serverless Containers.
- Modify `Dockerfile`: add or adjust targets for `api`, `bot-webhook`, `bot-long-polling`, and `migrations`.
- Modify `docker-compose.yml`: point local bot service at the long-polling target.
- Create `.github/workflows/release.yml`: tag-based release workflow.
- Modify `README.md`: document production deployment and required secrets.
- Add tests near existing bot/API tests for port selection and webhook secret validation.

### Task 1: API Serverless Port Compatibility

**Files:**
- Modify: `src/index.ts`
- Test: verify with `npm run typecheck`.

- [ ] **Step 1: Extract port resolution**

Change `src/index.ts` so `PORT` has priority over `API_PORT`:

```ts
const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
const HOST = process.env.API_HOST || '0.0.0.0';
```

- [ ] **Step 2: Run verification**

Run:

```bash
npm run typecheck
```

Expected: TypeScript passes.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: support serverless api port"
```

### Task 2: PostgreSQL Pool Settings

**Files:**
- Modify: `knexfile.ts`
- Test: `npm run typecheck`

- [ ] **Step 1: Inspect current Knex config**

Open `knexfile.ts` and identify where `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` are read.

- [ ] **Step 2: Add conservative pool defaults**

Configure Knex with a small pool:

```ts
pool: {
  min: Number(process.env.DB_POOL_MIN ?? 0),
  max: Number(process.env.DB_POOL_MAX ?? 2),
},
```

Keep environment overrides so local and migration workloads can increase the pool by setting `DB_POOL_MIN` and `DB_POOL_MAX`.

- [ ] **Step 3: Run verification**

Run:

```bash
npm run typecheck
npm test
```

Expected: typecheck and tests pass.

- [ ] **Step 4: Commit**

```bash
git add knexfile.ts
git commit -m "feat: tune database pool for serverless"
```

### Task 3: Refactor Bot Construction

**Files:**
- Modify: `src/bot/index.ts`
- Create: `src/bot/long-polling.ts`
- Test: existing `test/bot.*.test.ts`

- [ ] **Step 1: Export bot factory**

Move bot creation, middleware, commands, menu setup, and handlers into exported functions from `src/bot/index.ts`:

```ts
export function createBot() {
  const bot = new Bot<MyContext>(token);
  bot.use(session({ initial: (): SessionData => ({}) }));
  registerBotHandlers(bot);
  return bot;
}

export async function configureBotApi(bot: Bot<MyContext>) {
  await bot.api.setMyCommands(botCommands);
  if (webAppUrl) {
    await bot.api.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: 'Сканировать QR',
        web_app: { url: webAppUrl },
      },
    });
  }
}
```

Remove direct `bot.start()` from `src/bot/index.ts`.

- [ ] **Step 2: Add long-polling entrypoint**

Create `src/bot/long-polling.ts`:

```ts
import { configureBotApi, createBot } from './index.ts';

const bot = createBot();

await configureBotApi(bot);
bot.start();

console.log('Bot long polling started');
```

- [ ] **Step 3: Update local Docker command**

Make the local bot Docker target run:

```text
node --experimental-strip-types src/bot/long-polling.ts
```

- [ ] **Step 4: Run bot tests**

Run:

```bash
npm test -- test/bot.menu.test.ts test/bot.create-card-command.test.ts test/bot.pending-menu-action.test.ts test/bot.scan-web-app.test.ts
npm run typecheck
```

Expected: bot tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add src/bot/index.ts src/bot/long-polling.ts Dockerfile docker-compose.yml
git commit -m "refactor: split bot construction from long polling"
```

### Task 4: Add Bot Webhook Runtime

**Files:**
- Create: `src/bot/webhook.ts`
- Test: create `test/bot.webhook.test.ts`

- [ ] **Step 1: Write webhook secret validation test**

Create `test/bot.webhook.test.ts` with tests for missing and invalid `X-Telegram-Bot-Api-Secret-Token`.

Expected behavior:

```text
POST /webhook without valid secret -> 401
```

- [ ] **Step 2: Implement Fastify webhook app**

Create `src/bot/webhook.ts`:

```ts
import Fastify from 'fastify';
import { webhookCallback } from 'grammy';
import { configureBotApi, createBot } from './index.ts';

const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!secret) {
  throw new Error('TELEGRAM_WEBHOOK_SECRET is required');
}

const bot = createBot();
const app = Fastify({ logger: true });
const callback = webhookCallback(bot, 'fastify');

app.post('/webhook', async (request, reply) => {
  if (request.headers['x-telegram-bot-api-secret-token'] !== secret) {
    reply.code(401);
    return { ok: false };
  }

  return callback(request, reply);
});

app.get('/health', async () => ({ ok: true }));

await configureBotApi(bot);

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
```

Extract `createWebhookApp(bot, secret)` from this file and test that helper with `app.inject(...)` so the test does not start a network listener.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- test/bot.webhook.test.ts
npm run typecheck
```

Expected: webhook tests and typecheck pass.

- [ ] **Step 4: Commit**

```bash
git add src/bot/webhook.ts test/bot.webhook.test.ts
git commit -m "feat: add telegram webhook runtime"
```

### Task 5: Docker Image Targets

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Update Dockerfile targets**

Keep existing `api` and `migrations` targets. Change bot targets to make production and local mode explicit:

```dockerfile
FROM base AS bot-long-polling
CMD ["node", "--experimental-strip-types", "src/bot/long-polling.ts"]

FROM base AS bot-webhook
EXPOSE 3000
CMD ["node", "--experimental-strip-types", "src/bot/webhook.ts"]
```

- [ ] **Step 2: Update local compose**

Point the `bot` service in `docker-compose.yml` to:

```yaml
target: bot-long-polling
```

Do not require `TELEGRAM_WEBHOOK_SECRET` for local long polling.

- [ ] **Step 3: Build all targets locally**

Run:

```bash
docker build --target api -t ion-gift-card-api:local .
docker build --target bot-webhook -t ion-gift-card-bot-webhook:local .
docker build --target migrations -t ion-gift-card-migrations:local .
```

Expected: all three images build.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: add production docker targets"
```

### Task 6: GitHub Actions Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Add tag trigger and checks**

Create a workflow triggered by:

```yaml
on:
  push:
    tags:
      - "v*.*.*"
```

The first job must run:

```bash
npm ci
npm run typecheck
npm test
```

- [ ] **Step 2: Add Yandex registry login**

Use `yc-actions/yc-cr-login` with:

```yaml
yc-sa-json-credentials: ${{ secrets.YC_SA_JSON_CREDENTIALS }}
```

- [ ] **Step 3: Build and push images**

Push these images:

```text
cr.yandex/${{ secrets.YC_REGISTRY_ID }}/ion-gift-card-api:${{ github.ref_name }}
cr.yandex/${{ secrets.YC_REGISTRY_ID }}/ion-gift-card-bot-webhook:${{ github.ref_name }}
cr.yandex/${{ secrets.YC_REGISTRY_ID }}/ion-gift-card-migrations:${{ github.ref_name }}
```

- [ ] **Step 4: Run migrations before deploy**

Run the migrations image as a CI step with production DB secrets supplied from GitHub environment or fetched from Lockbox. The command must execute:

```bash
node --experimental-strip-types src/db/migrations/run.ts
```

- [ ] **Step 5: Deploy serverless containers**

Deploy API and bot using `yc-actions/yc-sls-container-deploy`. API and bot revisions must receive Lockbox-backed env vars.

- [ ] **Step 6: Register Telegram webhook**

After bot deployment, call:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=$TELEGRAM_WEBHOOK_URL/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: deploy release tags to yandex cloud"
```

### Task 7: Production Documentation

**Files:**
- Modify: `README.md`
- Create: `docs/deployment-yandex-cloud.md`

- [ ] **Step 1: Document infrastructure prerequisites**

Document required Yandex resources:

```text
Managed PostgreSQL
Container Registry
Lockbox secret
Runtime service account
CI service account
API Serverless Container
Bot Serverless Container
```

- [ ] **Step 2: Document required secrets**

Document Lockbox runtime keys and GitHub repository secrets from the design document.

- [ ] **Step 3: Document release flow**

Document:

```bash
git tag v1.2.3
git push origin v1.2.3
```

Explain that GitHub Actions builds images, runs migrations, deploys revisions, and registers Telegram webhook.

- [ ] **Step 4: Run final verification**

Run:

```bash
npm run typecheck
npm test
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/deployment-yandex-cloud.md
git commit -m "docs: describe yandex cloud deployment"
```

## Final Verification

- [ ] Run:

```bash
npm run typecheck
npm test
docker build --target api -t ion-gift-card-api:verify .
docker build --target bot-webhook -t ion-gift-card-bot-webhook:verify .
docker build --target migrations -t ion-gift-card-migrations:verify .
```

- [ ] Confirm the release workflow is syntactically valid in GitHub Actions.
- [ ] Confirm local Docker Compose still starts PostgreSQL, migrations, API, and long-polling bot.
- [ ] Confirm production bot webhook rejects invalid Telegram secret headers.
