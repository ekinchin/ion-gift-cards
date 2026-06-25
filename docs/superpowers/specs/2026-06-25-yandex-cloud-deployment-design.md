# Yandex Cloud Deployment Design

## Status

Draft design for production deployment.

## Source Context

This document captures the deployment direction from the shared ChatGPT discussion:

- source: `https://chatgpt.com/share/6a3d55be-1be4-83ed-9b83-8f988d5205b9`
- page title: `Развертывание Node.js в YC`
- project context: `ion-gift-card`, Node.js 24, Fastify API, grammY Telegram bot, PostgreSQL, Docker.

The current repository already has:

- one Dockerfile with separate `api`, `bot`, and `migrations` targets;
- `docker-compose.yml` for local API, bot, PostgreSQL, and migrations;
- SQL migration history through `schema_migrations`;
- public `/health` endpoint;
- Telegram bot running through long polling with `bot.start()`.

## Decision

Use Yandex Cloud Serverless Containers for runtime workloads and Managed PostgreSQL for the database.

Target architecture:

```text
Git tag vX.Y.Z
        |
        v
GitHub Actions
        |
        +--> build api image
        +--> build bot-webhook image
        +--> build migrations image
        |
        v
Yandex Container Registry
        |
        +--> run migrations once
        +--> deploy API Serverless Container revision
        +--> deploy Bot Serverless Container revision
        |
        v
Telegram setWebhook
```

Infrastructure:

- Yandex Managed Service for PostgreSQL for the production database.
- Yandex Container Registry for immutable release images.
- Yandex Serverless Containers for API and Telegram webhook runtimes.
- Yandex Lockbox for runtime secrets.
- GitHub Actions for tag-based releases.

## Goals

- Release production by pushing a git tag such as `v1.2.3`.
- Publish immutable Docker images tagged with the release version.
- Keep application secrets out of the repository and out of GitHub Actions logs.
- Deploy API and bot as independent runtime containers.
- Move Telegram bot from long polling to webhook mode for serverless compatibility.
- Run database migrations automatically before deploying new application revisions.

## Non-Goals

- No Kubernetes for the first production deployment.
- No Terraform in the first implementation plan unless infrastructure drift becomes a problem.
- No rewrite of business logic, card ownership, or operator workflows.
- No replacement of the existing SQL migration runner.

## Runtime Containers

### API Container

The API remains a Fastify HTTP service.

Required adaptation:

- read only `PORT`, because Yandex Serverless Containers inject the runtime port through `PORT`;
- keep host `0.0.0.0`;
- keep `/health` available for platform checks.

### Bot Webhook Container

The bot should expose an HTTP endpoint instead of calling `bot.start()`.

Required adaptation:

- split bot construction from bot startup so tests, long polling, and webhook runtime can reuse the same handlers;
- add a webhook entrypoint with Fastify and `webhookCallback` from grammY;
- expose `POST /webhook`;
- validate the Telegram header `X-Telegram-Bot-Api-Secret-Token` against `TELEGRAM_WEBHOOK_SECRET`;
- keep the existing long-polling entrypoint available for local development.

Telegram webhook registration should happen after the bot container revision is deployed:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=$TELEGRAM_WEBHOOK_URL/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

## Images

Publish three release images:

```text
ion-gift-card-api:vX.Y.Z
ion-gift-card-bot-webhook:vX.Y.Z
ion-gift-card-migrations:vX.Y.Z
```

The repository can keep one Dockerfile, but it needs a dedicated webhook target or command for the bot webhook runtime.

## Secrets

Production runtime secrets belong in Lockbox:

```text
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
WEB_APP_URL
API_BASE_URL
```

GitHub should store only deployment credentials and non-secret identifiers required by CI/CD:

```text
YC_SA_JSON_CREDENTIALS
YC_FOLDER_ID
YC_REGISTRY_ID
YC_RUNTIME_SA_ID
YC_API_CONTAINER_NAME
YC_BOT_CONTAINER_NAME
YC_LOCKBOX_SECRET_ID
```

## Database

The migration runner already records applied SQL files in `schema_migrations`, so deployment can run migrations on every release and safely skip already applied versions.

The migrations step must complete before new API and bot revisions are deployed.

For serverless runtime, reduce PostgreSQL pool pressure. API and bot run as separate scalable containers, so each runtime should use a small pool:

```ts
pool: {
  min: 0,
  max: 2,
}
```

The migrations command should use the same default pool values unless explicit `DB_POOL_MIN` and `DB_POOL_MAX` values are set for a one-off migration run.

## CI/CD

Release trigger:

```yaml
on:
  push:
    tags:
      - "v*.*.*"
```

Pipeline order:

1. Check out the repository.
2. Run `npm ci`.
3. Run `npm run typecheck`.
4. Run `npm test`.
5. Log in to Yandex Container Registry.
6. Build and push API image.
7. Build and push bot webhook image.
8. Build and push migrations image.
9. Run migrations against Managed PostgreSQL.
10. Deploy API Serverless Container revision.
11. Deploy Bot Serverless Container revision.
12. Register Telegram webhook for the bot revision URL.

## Error Handling and Rollback

- If tests fail, no image is pushed.
- If image push fails, no deployment happens.
- If migrations fail, no new runtime revisions are deployed.
- If API deployment fails, bot deployment and webhook registration should not run.
- If bot deployment succeeds but webhook registration fails, the release should fail loudly and print the failing registration step.
- Rollback is done by redeploying a previous image tag as a new Serverless Container revision. Database rollback is not automatic and must be handled by forward-compatible migrations.

## Acceptance Criteria

- A production release can be started by pushing a version tag.
- CI publishes three versioned images to Yandex Container Registry.
- Runtime secrets are supplied from Lockbox.
- API runs in Yandex Serverless Containers and reads the platform `PORT`.
- Bot runs in Yandex Serverless Containers through Telegram webhooks.
- Telegram webhook requests are rejected when `X-Telegram-Bot-Api-Secret-Token` is invalid.
- Migrations run once per release before runtime deployment.
- Existing local Docker Compose flow remains usable.
- `npm run typecheck` and `npm test` pass before images are pushed.
