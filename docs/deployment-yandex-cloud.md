# Yandex Cloud Deployment

Production runs as separate Yandex Serverless Containers for the API and Telegram webhook bot. Release images are stored in Yandex Container Registry, PostgreSQL runs in Yandex Managed Service for PostgreSQL, and runtime secrets are injected from Yandex Lockbox.

## Infrastructure

Required Yandex Cloud resources:

- Managed PostgreSQL database.
- Container Registry.
- Lockbox secret with runtime configuration keys.
- Runtime service account for Serverless Container revisions.
- CI service account for GitHub Actions deployments.
- Workload Identity Federation for GitHub Actions.
- API Serverless Container.
- Bot Serverless Container.

The runtime service account must be able to pull images and read Lockbox payloads. The CI service account must be able to exchange a GitHub OIDC token for a short-lived Yandex Cloud IAM token, push Container Registry images, deploy Serverless Container revisions, run migrations, and register the Telegram webhook.

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

## GitHub Authentication Without Secrets

The release workflow should use Yandex Workload Identity Federation instead of a static service account JSON key. GitHub Actions issues an OIDC token for the workflow run, Yandex Cloud exchanges it for a short-lived IAM token, and Yandex Cloud actions use that IAM token for registry login and deployment.

This removes the need for `YC_SA_JSON_CREDENTIALS` in GitHub Secrets.

The workflow must request an OIDC token:

```yaml
permissions:
  id-token: write
  contents: read
```

The workflow should obtain a Yandex Cloud IAM token before calling Yandex Cloud actions:

```yaml
- name: Get Yandex Cloud IAM token
  id: iam-token
  uses: docker://ghcr.io/yc-actions/yc-iam-token-fed:1.0.0
  with:
    yc-sa-id: ${{ vars.YC_CI_SA_ID }}
```

Then pass the token to Yandex Cloud actions instead of `yc-sa-json-credentials`:

```yaml
- name: Login to Yandex Cloud Container Registry
  uses: yc-actions/yc-cr-login@v3
  with:
    yc-iam-token: ${{ steps.iam-token.outputs.iam-token }}
```

```yaml
- name: Deploy API container
  uses: yc-actions/yc-sls-container-deploy@v4
  with:
    yc-iam-token: ${{ steps.iam-token.outputs.iam-token }}
    folder-id: ${{ vars.YC_FOLDER_ID }}
    container-name: ${{ vars.YC_API_CONTAINER_NAME }}
    revision-service-account-id: ${{ vars.YC_RUNTIME_SA_ID }}
```

## GitHub Variables

Non-secret deployment identifiers can be stored as GitHub repository or environment variables:

```text
YC_CI_SA_ID
YC_FOLDER_ID
YC_REGISTRY_ID
YC_RUNTIME_SA_ID
YC_API_CONTAINER_NAME
YC_BOT_CONTAINER_NAME
YC_LOCKBOX_SECRET_ID
TELEGRAM_WEBHOOK_URL
```

Optional GitHub environment variables:

```text
DB_POOL_MIN
DB_POOL_MAX
```

These values are identifiers or public routing configuration, not application secrets.

## Runtime Secrets

Application secrets must stay in Yandex Lockbox:

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

Runtime API and bot revisions receive these values through `revision-secrets`, so the application does not need GitHub Secrets for runtime configuration.

## Migration Plan: Remove GitHub Secrets

### Phase 1: Remove static Yandex Cloud credentials

- Create a Yandex Cloud Workload Identity Federation for GitHub Actions.
- Link the GitHub workflow subject to the CI service account.
- Grant the CI service account only the roles required for image push, Serverless Container deployment, Lockbox read access needed by CI, and migration execution.
- Add `permissions.id-token: write` to `.github/workflows/release.yml`.
- Replace `YC_SA_JSON_CREDENTIALS` usage with `yc-iam-token-fed` and `yc-iam-token`.
- Move Yandex Cloud IDs from GitHub Secrets to GitHub Variables.
- Delete `YC_SA_JSON_CREDENTIALS` from GitHub Secrets.

After this phase, GitHub no longer stores long-lived Yandex Cloud credentials.

### Phase 2: Remove database and Telegram secrets from GitHub

Current CI still needs database credentials for migrations and Telegram credentials for `setWebhook`. Replace direct GitHub Secrets with one of the following approaches.

Preferred approach:

- Keep `DB_*`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_WEBHOOK_SECRET` only in Yandex Lockbox.
- During the workflow, use the WIF-issued IAM token to read the required Lockbox payload values.
- Pass the values only to the short-lived migration and webhook registration steps.
- Do not store these values as GitHub Secrets.

Stricter approach:

- Do not expose runtime secrets to GitHub Actions at all.
- Run migrations inside Yandex Cloud as a dedicated one-shot container or job using the runtime service account and Lockbox-backed environment variables.
- Register the Telegram webhook from a dedicated internal deployment step or service inside Yandex Cloud that also reads from Lockbox.

After this phase, GitHub Secrets should be empty for the release workflow.

### Phase 3: Harden federation and permissions

- Restrict the federated credential subject to this repository and release tag refs only.
- Use a separate CI service account from the runtime service account.
- Keep CI roles minimal and scoped to the target folder, registry, containers, and Lockbox secret.
- Prefer GitHub `production` environment protection rules for tagged releases.
- Rotate or delete any old authorized keys after WIF is active.

## Release Flow

Create and push a version tag:

```bash
git tag v1.2.3
git push origin v1.2.3
```

GitHub Actions then:

1. Runs `npm ci`, `npm run typecheck`, and `npm test`.
2. Exchanges the GitHub OIDC token for a short-lived Yandex Cloud IAM token through Workload Identity Federation.
3. Logs in to Yandex Container Registry with the IAM token.
4. Builds and pushes `ion-gift-card-api`, `ion-gift-card-bot-webhook`, and `ion-gift-card-migrations` images tagged with the Git tag.
5. Runs the migrations image before deploying runtime revisions.
6. Deploys API and bot Serverless Container revisions with Lockbox-backed secrets.
7. Registers the Telegram webhook at `${TELEGRAM_WEBHOOK_URL}/webhook` with `TELEGRAM_WEBHOOK_SECRET`.

If checks, image push, migrations, or deployment fail, the workflow stops before later release steps. Rollback is done by redeploying a previous image tag as a new Serverless Container revision; database rollback is not automatic.
