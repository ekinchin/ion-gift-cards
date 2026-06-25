# Yandex Cloud Deployment

Production runs as separate Yandex Serverless Containers for the API and Telegram webhook bot. Release images are stored in Yandex Container Registry, PostgreSQL runs in Yandex Managed Service for PostgreSQL, and runtime secrets are injected from Yandex Lockbox.

## Infrastructure

Required Yandex Cloud resources:

- Managed PostgreSQL database.
- Container Registry.
- Lockbox secret with runtime configuration keys.
- Runtime service account for Serverless Container revisions.
- CI service account for GitHub Actions deployments.
- API Serverless Container.
- Bot Serverless Container.

The runtime service account must be able to pull images and read Lockbox payloads. The CI service account must be able to push Container Registry images and deploy Serverless Container revisions.

## Runtime Configuration

Lockbox secret keys consumed by Serverless Container revisions:

```text
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
WEB_APP_URL
```

The API container also receives:

```text
API_HOST=0.0.0.0
DB_POOL_MIN=0
DB_POOL_MAX=2
```

The bot webhook container also receives:

```text
TELEGRAM_MODE=webhook
API_HOST=0.0.0.0
DB_POOL_MIN=0
DB_POOL_MAX=2
```

Yandex Serverless Containers supplies `PORT`; do not set `API_PORT` in production.

## GitHub Secrets

Repository or `production` environment secrets used by `.github/workflows/release.yml`:

```text
YC_SA_JSON_CREDENTIALS
YC_FOLDER_ID
YC_REGISTRY_ID
YC_RUNTIME_SA_ID
YC_API_CONTAINER_NAME
YC_BOT_CONTAINER_NAME
YC_LOCKBOX_SECRET_ID
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_WEBHOOK_URL
```

Optional GitHub environment variables:

```text
DB_POOL_MIN
DB_POOL_MAX
```

`DB_*` secrets are used by the migration image in CI. Runtime API and bot revisions receive their `DB_*` values from Lockbox. `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `TELEGRAM_WEBHOOK_URL` are used by CI to register the Telegram webhook after deployment.

## Release Flow

Create and push a version tag:

```bash
git tag v1.2.3
git push origin v1.2.3
```

GitHub Actions then:

1. Runs `npm ci`, `npm run typecheck`, and `npm test`.
2. Logs in to Yandex Container Registry.
3. Builds and pushes `ion-gift-card-api`, `ion-gift-card-bot-webhook`, and `ion-gift-card-migrations` images tagged with the Git tag.
4. Runs the migrations image before deploying runtime revisions.
5. Deploys API and bot Serverless Container revisions with Lockbox-backed secrets.
6. Registers the Telegram webhook at `${TELEGRAM_WEBHOOK_URL}/webhook` with `TELEGRAM_WEBHOOK_SECRET`.

If checks, image push, migrations, or deployment fail, the workflow stops before later release steps. Rollback is done by redeploying a previous image tag as a new Serverless Container revision; database rollback is not automatic.
