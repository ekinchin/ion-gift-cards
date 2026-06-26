# Настройка Yandex Cloud и GitHub Actions

Эта инструкция описывает ручную подготовку Yandex Cloud под текущий workflow `.github/workflows/release.yml`.

Текущий workflow:

- запускается по tag `v*.*.*`;
- получает IAM token через GitHub OIDC / Yandex Cloud federation;
- читает production secrets из Lockbox;
- собирает и публикует 3 Docker image в Yandex Container Registry;
- запускает миграции из GitHub Actions runner через `docker run`;
- деплоит API и Telegram webhook bot в Yandex Serverless Containers;
- регистрирует Telegram webhook.

Важно: миграции сейчас выполняются из GitHub Actions runner. Поэтому для первого запуска PostgreSQL должен быть доступен из GitHub Actions. Самый простой вариант - Managed PostgreSQL с public access. Более строгий production-вариант - перенести миграции внутрь Yandex Cloud/VPC и добавить `revision-network-id` для Serverless Containers.

## 1. Подготовить YC CLI

```bash
yc init
yc config list
yc resource-manager folder list

export YC_FOLDER_ID=<folder_id>
yc config set folder-id "$YC_FOLDER_ID"
```

## 2. Проверить VPC network и subnet

Посмотрите существующие сети и подсети:

```bash
yc vpc network list
yc vpc subnet list
```

В выводе `yc vpc subnet list` нужны:

```text
ID         -> subnet id
NETWORK ID -> network id
ZONE       -> zone id
```

Пример:

```text
ID:         e9be0gun6906tqmknpcb
NETWORK ID: enpvlsgeaeurtm0kfbvp
ZONE:       ru-central1-a
```

Сохраните:

```bash
export YC_NETWORK_ID=<network_id>
export YC_SUBNET_ID=<subnet_id>
export YC_ZONE=ru-central1-a
```

Используйте `--network-id`, а не `--network-name default`, если подсеть создана в отдельной сети. Иначе Managed PostgreSQL может вернуть ошибку вида:

```text
subnet "<subnet_id>" not found
```

## 3. Создать Managed PostgreSQL

Создайте кластер, базу `ion_gift_card`, пользователя и пароль:

```bash
yc managed-postgresql cluster create \
  --name ion-gift-card-pg \
  --environment production \
  --network-id "$YC_NETWORK_ID" \
  --resource-preset s2.micro \
  --host zone-id="$YC_ZONE",subnet-id="$YC_SUBNET_ID",assign-public-ip=true \
  --disk-type network-ssd \
  --disk-size 20 \
  --user name=ion_user,password='<strong_password>' \
  --database name=ion_gift_card,owner=ion_user \
  --deletion-protection
```

Сохраните connection values:

```text
DB_HOST
DB_PORT
DB_NAME=ion_gift_card
DB_USER=ion_user
DB_PASSWORD
```

`DB_PORT` зависит от способа подключения. Используйте значение из connection info в Yandex Cloud.

## 4. Создать Container Registry

```bash
yc container registry create --name ion-gift-card --secure
yc container registry list
```

Сохраните ID registry вида `crp...`:

```text
YC_REGISTRY_ID=<registry_id>
```

## 5. Сгенерировать Telegram webhook secret

`TELEGRAM_WEBHOOK_SECRET` не выдаётся Telegram или Yandex Cloud. Это случайная строка, которую мы генерируем сами:

```bash
openssl rand -hex 32
```

Сохраните значение:

```text
TELEGRAM_WEBHOOK_SECRET=<generated_secret>
```

Оно должно быть одинаковым в Lockbox и при регистрации Telegram webhook. Workflow берёт его из Lockbox и передаёт в `setWebhook`.

## 6. Создать Lockbox secret

Runtime containers и release workflow читают production secrets из Lockbox.

Рекомендуемый способ - подготовить payload file, чтобы не светить секреты в shell history:

```bash
cat > lockbox-payload.json <<'JSON'
[
  {"key":"DB_HOST","text_value":"<db_host>"},
  {"key":"DB_PORT","text_value":"<db_port>"},
  {"key":"DB_NAME","text_value":"ion_gift_card"},
  {"key":"DB_USER","text_value":"ion_user"},
  {"key":"DB_PASSWORD","text_value":"<db_password>"},
  {"key":"TELEGRAM_BOT_TOKEN","text_value":"<bot_token>"},
  {"key":"TELEGRAM_WEBHOOK_SECRET","text_value":"<generated_secret>"},
  {"key":"WEB_APP_URL","text_value":"<bot_container_url_or_domain>/qr"}
]
JSON
```

Создайте secret:

```bash
yc lockbox secret create \
  --name ion-gift-card-runtime \
  --description "Ion Gift Card production runtime config" \
  --payload "$(cat lockbox-payload.json)" \
  --folder-id "$YC_FOLDER_ID" \
  --deletion-protection
```

Сохраните ID:

```text
YC_LOCKBOX_SECRET_ID=<secret_id>
```

После создания удалите локальный payload file, если он больше не нужен:

```bash
rm lockbox-payload.json
```

## 7. Создать service accounts

Нужны два service account:

- `ion-gift-card-ci` - GitHub Actions получает IAM token для этого account через federation.
- `ion-gift-card-runtime` - Serverless Container revisions используют этот account в runtime.

```bash
yc iam service-account create --name ion-gift-card-ci
yc iam service-account create --name ion-gift-card-runtime
yc iam service-account list
```

Сохраните:

```text
YC_CI_SA_ID=<ci_service_account_id>
YC_RUNTIME_SA_ID=<runtime_service_account_id>
```

## 8. Выдать роли

CI service account:

```bash
yc resource-manager folder add-access-binding "$YC_FOLDER_ID" \
  --role container-registry.images.pusher \
  --service-account-id "$YC_CI_SA_ID"

yc resource-manager folder add-access-binding "$YC_FOLDER_ID" \
  --role serverless-containers.editor \
  --service-account-id "$YC_CI_SA_ID"

yc resource-manager folder add-access-binding "$YC_FOLDER_ID" \
  --role iam.serviceAccounts.user \
  --service-account-id "$YC_CI_SA_ID"

yc resource-manager folder add-access-binding "$YC_FOLDER_ID" \
  --role functions.editor \
  --service-account-id "$YC_CI_SA_ID"

yc resource-manager folder add-access-binding "$YC_FOLDER_ID" \
  --role vpc.user \
  --service-account-id "$YC_CI_SA_ID"

yc resource-manager folder add-access-binding "$YC_FOLDER_ID" \
  --role lockbox.payloadViewer \
  --service-account-id "$YC_CI_SA_ID"

yc resource-manager folder add-access-binding "$YC_FOLDER_ID" \
  --role lockbox.viewer \
  --service-account-id "$YC_CI_SA_ID"
```

Runtime service account:

```bash
yc resource-manager folder add-access-binding "$YC_FOLDER_ID" \
  --role container-registry.images.puller \
  --service-account-id "$YC_RUNTIME_SA_ID"

yc resource-manager folder add-access-binding "$YC_FOLDER_ID" \
  --role lockbox.payloadViewer \
  --service-account-id "$YC_RUNTIME_SA_ID"
```

Если Lockbox secret зашифрован KMS-ключом, runtime service account также должен иметь права на decrypt этого ключа.

## 9. Связать GitHub repository с Yandex Cloud через federation

Текущий workflow не использует долгоживущий `YC_SA_JSON_CREDENTIALS`. Вместо этого он запрашивает GitHub OIDC token и меняет его на Yandex Cloud IAM token через:

```yaml
permissions:
  id-token: write

- uses: docker://ghcr.io/yc-actions/yc-iam-token-fed:1.0.0
  with:
    yc-sa-id: ${{ vars.YC_CI_SA_ID }}
```

В Yandex Cloud нужно настроить federation/provider для GitHub Actions OIDC и разрешить вашему GitHub repository получать token для service account `ion-gift-card-ci`.

Настройте federation так, чтобы были ограничены минимум:

```text
repository=<github_owner>/<github_repo>
ref=refs/tags/v*
```

Если настраиваете через UI, ищите раздел IAM / Workload Identity Federation или Federation для service accounts. Если у вас уже настроен federation/provider для GitHub Actions, просто добавьте binding/condition для этого repository и service account.

Проверочное значение, которое понадобится GitHub workflow:

```text
YC_CI_SA_ID=<ci_service_account_id>
```

## 10. Создать Serverless Containers

```bash
yc serverless container create --name ion-gift-card-api
yc serverless container create --name ion-gift-card-bot
yc serverless container list
```

Сделайте оба контейнера публично вызываемыми. Это нужно для Telegram webhook и внешних API/health checks:

```bash
yc serverless container add-access-binding ion-gift-card-api \
  --role serverless-containers.invoker \
  --all-users

yc serverless container add-access-binding ion-gift-card-bot \
  --role serverless-containers.invoker \
  --all-users
```

Сохраните:

```text
YC_API_CONTAINER_NAME=ion-gift-card-api
YC_BOT_CONTAINER_NAME=ion-gift-card-bot
TELEGRAM_WEBHOOK_URL=<bot_container_url_without_trailing_slash>
```

`TELEGRAM_WEBHOOK_URL` - URL bot container из `yc serverless container list` или ваш домен, если вы будете ставить свой домен перед контейнером. Значение может быть со слэшем в конце или без него; release workflow нормализует URL перед регистрацией webhook.

После того как станет известен `TELEGRAM_WEBHOOK_URL`, обновите `WEB_APP_URL` в Lockbox, если QR mini app должен открываться через production URL:

```text
WEB_APP_URL=<api_or_bot_domain>/qr
```

## 11. Настроить GitHub repository

В GitHub откройте:

```text
Repository -> Settings -> Secrets and variables -> Actions
```

Создайте environment:

```text
production
```

Workflow использует `environment: production`, поэтому variables лучше добавлять именно в environment `production`.

Добавьте GitHub environment variables:

```text
YC_CI_SA_ID=<ci_service_account_id>
YC_FOLDER_ID=<folder_id>
YC_REGISTRY_ID=<registry_id>
YC_RUNTIME_SA_ID=<runtime_service_account_id>
YC_API_CONTAINER_NAME=ion-gift-card-api
YC_BOT_CONTAINER_NAME=ion-gift-card-bot
YC_NETWORK_ID=<network_id>
YC_LOCKBOX_SECRET_ID=<lockbox_secret_id>
TELEGRAM_WEBHOOK_URL=<bot_container_url_without_trailing_slash>
```

Опционально:

```text
DB_POOL_MIN=0
DB_POOL_MAX=2
```

`YC_NETWORK_ID` должен быть ID той VPC network, где находится подсеть Managed PostgreSQL. Workflow передаёт его в `revision-network-id` для API и bot revisions, чтобы runtime containers могли ходить в PostgreSQL через облачную сеть.

GitHub secrets для текущего workflow не нужны, если federation настроен корректно. Production secrets (`DB_*`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `WEB_APP_URL`) хранятся в Lockbox.

## 12. Запустить первый релиз

Убедитесь, что все коммиты запушены:

```bash
git push origin main
```

Создайте и запушьте tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions должен выполнить:

1. `npm ci`, `npm run typecheck`, `npm test`.
2. Получение Yandex Cloud IAM token через federation.
3. Установку и настройку YC CLI.
4. Чтение release secrets из Lockbox.
5. Login в Yandex Container Registry.
6. Build/push images:
   - `ion-gift-card-api`
   - `ion-gift-card-bot-webhook`
   - `ion-gift-card-migrations`
7. Запуск миграций.
8. Deploy API Serverless Container.
9. Deploy bot webhook Serverless Container.
10. Регистрацию Telegram webhook.

## 13. Проверить после релиза

Проверьте health endpoints:

```bash
curl https://<api_container_url>/health
curl https://<bot_container_url>/health
```

Проверьте webhook в Telegram:

```bash
curl "https://api.telegram.org/bot<token>/getWebhookInfo"
```

В Telegram отправьте боту:

```text
/start
```

## 14. Что улучшить после первого запуска

- Закрыть публичный доступ к PostgreSQL.
- Закрыть публичный доступ к PostgreSQL после проверки runtime-доступа через VPC.
- Перенести миграции в Yandex Cloud network, чтобы GitHub runner не ходил в БД напрямую.
- Закрепить versions/actions по digest там, где это критично для supply chain.
