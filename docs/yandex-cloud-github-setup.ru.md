# Настройка Yandex Cloud и GitHub Actions

Эта инструкция описывает ручную подготовку Yandex Cloud под текущий workflow `.github/workflows/release-polling-vm.yml`.

Текущий workflow:

- запускается по tag `v*.*.*`;
- получает IAM token через GitHub OIDC / Yandex Cloud federation;
- читает production secrets из Lockbox;
- собирает и публикует 3 Docker image в Yandex Container Registry;
- запускает миграции из GitHub Actions runner через `docker run`;
- деплоит API в Yandex Serverless Containers;
- создаёт или обновляет Compute Cloud VM с Container Solution для Telegram long polling bot;
- удаляет Telegram webhook, чтобы polling мог получать updates.

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

`TELEGRAM_WEBHOOK_SECRET` нужен только для старого ручного webhook workflow `.github/workflows/release.yml`. Для текущего polling workflow он не используется. Если хотите оставить возможность ручного отката на webhook, сохраните secret:

```bash
openssl rand -hex 32
```

Сохраните значение:

```text
TELEGRAM_WEBHOOK_SECRET=<generated_secret>
```

Оно должно быть одинаковым в Lockbox и при регистрации Telegram webhook. Старый ручной workflow берёт его из Lockbox и передаёт в `setWebhook`.

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
  {"key":"TELEGRAM_WEBHOOK_SECRET","text_value":"<generated_secret_for_legacy_webhook_workflow>"},
  {"key":"WEB_APP_URL","text_value":"<api_domain>/qr"}
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
- `ion-gift-card-runtime` - Serverless Container revision и bot VM используют этот account в runtime.

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
  --role compute.editor \
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
  --role vpc.user \
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
yc serverless container list
```

Сделайте API container публично вызываемым. Это нужно для внешних API/health checks:

```bash
yc serverless container add-access-binding ion-gift-card-api \
  --role serverless-containers.invoker \
  --all-users
```

Сохраните:

```text
YC_API_CONTAINER_NAME=ion-gift-card-api
```

Bot больше не создаётся как Serverless Container: Telegram updates забираются через long polling с Compute VM, поэтому публичный endpoint для Telegram не нужен.

Обновите `WEB_APP_URL` в Lockbox на production URL для QR mini app:

```text
WEB_APP_URL=<api_domain>/qr
```

## 10a. Подготовить Compute VM параметры для polling bot

VM создаётся автоматически workflow через `yc compute instance create` на базе Yandex Container Optimized Image. Если instance с именем `YC_BOT_VM_NAME` уже есть, workflow удаляет его и создаёт заново: bot stateless, а durable state хранится в PostgreSQL.

Секреты `DB_*`, `TELEGRAM_BOT_TOKEN` и `WEB_APP_URL` не передаются через Compute metadata. В metadata хранится только cloud-init `user-data` с image tag и `YC_LOCKBOX_SECRET_ID`. При boot systemd unit внутри VM читает Lockbox через runtime service account, пишет root-only env file и запускает контейнер через Docker.

Обязательные GitHub variables:

```text
YC_BOT_VM_NAME=ion-gift-card-bot
YC_ZONE=<zone_id>
YC_SUBNET_ID=<subnet_id>
```

Опциональные GitHub variables с defaults:

```text
YC_BOT_VM_CORES=2
YC_BOT_VM_MEMORY=2
YC_BOT_VM_CORE_FRACTION=20
YC_BOT_VM_DISK_SIZE=16
YC_BOT_VM_DISK_TYPE=network-hdd
YC_BOT_VM_PLATFORM=standard-v3
```

VM получает public NAT только для исходящего доступа к Telegram API. Inbound HTTP для polling bot не нужен.

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
YC_NETWORK_ID=<network_id>
YC_SUBNET_ID=<subnet_id>
YC_ZONE=<zone_id>
YC_BOT_VM_NAME=ion-gift-card-bot
YC_LOCKBOX_SECRET_ID=<lockbox_secret_id>
```

Опционально:

```text
DB_POOL_MIN=0
DB_POOL_MAX=2
```

`YC_NETWORK_ID` должен быть ID той VPC network, где находится подсеть Managed PostgreSQL. Workflow передаёт его в `revision-network-id` для API revision, чтобы runtime container мог ходить в PostgreSQL через облачную сеть.
`YC_SUBNET_ID` должен быть ID подсети для Compute VM с polling bot. VM должна иметь исходящий доступ к Telegram API; текущий workflow создаёт public NAT address на network interface.

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
   - `ion-gift-card-bot-polling`
   - `ion-gift-card-migrations`
7. Запуск миграций.
8. Deploy API Serverless Container.
9. Create/update Compute VM container для polling bot.
10. Удаление Telegram webhook через `deleteWebhook`.

## 13. Проверить после релиза

Проверьте health endpoints:

```bash
curl https://<api_container_url>/health
```

Проверьте, что Telegram webhook очищен:

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
