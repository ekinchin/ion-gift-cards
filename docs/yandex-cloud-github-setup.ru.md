# Настройка Yandex Cloud и GitHub Actions

Эта инструкция описывает ручную подготовку Yandex Cloud под текущий workflow `.github/workflows/release.yml`.

Текущий workflow запускает миграции из GitHub Actions runner через `docker run`. Поэтому для первого запуска PostgreSQL должен быть доступен из GitHub Actions. Самый простой вариант - Managed PostgreSQL с public access. Более строгий production-вариант - доработать workflow так, чтобы миграции выполнялись внутри Yandex Cloud/VPC, а Serverless Containers получали `revision-network-id`.

## 1. Подготовить YC CLI

```bash
yc init
yc config list
yc resource-manager folder list
export YC_FOLDER_ID=<folder_id>
yc config set folder-id "$YC_FOLDER_ID"
```

## 2. Создать Managed PostgreSQL

Создайте кластер, базу `ion_gift_card`, пользователя и пароль. Пример CLI-команды:

```bash
yc managed-postgresql cluster create \
  --name ion-gift-card-pg \
  --environment production \
  --network-name default \
  --resource-preset s2.micro \
  --host zone-id=ru-central1-a,subnet-id=<subnet_id>,assign-public-ip=true \
  --disk-type network-ssd \
  --disk-size 20 \
  --user name=ion_user,password='<strong_password>' \
  --database name=ion_gift_card,owner=ion_user \
  --deletion-protection
```

Сохраните значения:

```text
DB_HOST
DB_PORT
DB_NAME=ion_gift_card
DB_USER=ion_user
DB_PASSWORD
```

`DB_PORT` зависит от способа подключения: используйте значение из connection info в Yandex Cloud.

## 3. Создать Container Registry

```bash
yc container registry create --name ion-gift-card --secure
yc container registry list
```

Сохраните ID registry вида `crp...`:

```text
YC_REGISTRY_ID=<registry_id>
```

## 4. Создать Lockbox secret

Runtime containers получают секреты из Lockbox. Создайте secret:

```bash
yc lockbox secret create \
  --name ion-gift-card-runtime \
  --description "Ion Gift Card production runtime config" \
  --payload "[
    {'key':'DB_HOST','text_value':'<db_host>'},
    {'key':'DB_PORT','text_value':'<db_port>'},
    {'key':'DB_NAME','text_value':'ion_gift_card'},
    {'key':'DB_USER','text_value':'ion_user'},
    {'key':'DB_PASSWORD','text_value':'<db_password>'},
    {'key':'TELEGRAM_BOT_TOKEN','text_value':'<bot_token>'},
    {'key':'TELEGRAM_WEBHOOK_SECRET','text_value':'<random_secret>'},
    {'key':'WEB_APP_URL','text_value':'<bot_container_url_or_domain>/qr'}
  ]" \
  --folder-id "$YC_FOLDER_ID" \
  --deletion-protection
```

Сохраните ID:

```text
YC_LOCKBOX_SECRET_ID=<secret_id>
```

`TELEGRAM_WEBHOOK_SECRET` должен быть случайной строкой. То же значение понадобится в GitHub secret.

## 5. Создать service accounts

Нужны два service account:

- `ion-gift-card-ci` - используется GitHub Actions для push images и deploy.
- `ion-gift-card-runtime` - используется Serverless Container revisions в runtime.

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

## 6. Выдать роли

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
  --role lockbox.payloadViewer \
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

## 7. Создать authorized key для GitHub Actions

```bash
yc iam key create \
  --service-account-id "$YC_CI_SA_ID" \
  -o yc-ci-key.json
```

Содержимое `yc-ci-key.json` целиком понадобится в GitHub secret `YC_SA_JSON_CREDENTIALS`.

Храните файл аккуратно: приватную часть ключа нельзя получить повторно из Yandex Cloud.

## 8. Создать Serverless Containers

```bash
yc serverless container create --name ion-gift-card-api
yc serverless container create --name ion-gift-card-bot
yc serverless container list
```

Сохраните:

```text
YC_API_CONTAINER_NAME=ion-gift-card-api
YC_BOT_CONTAINER_NAME=ion-gift-card-bot
TELEGRAM_WEBHOOK_URL=<bot_container_url_without_trailing_slash>
```

`TELEGRAM_WEBHOOK_URL` - URL bot container из `yc serverless container list` или ваш домен, если вы будете ставить свой домен перед контейнером.

## 9. Настроить GitHub repository

В GitHub откройте:

```text
Repository -> Settings -> Secrets and variables -> Actions
```

Создайте environment:

```text
production
```

Workflow использует `environment: production`, поэтому secrets лучше добавлять именно в environment `production`.

Добавьте GitHub secrets:

```text
YC_SA_JSON_CREDENTIALS=<полный JSON из yc-ci-key.json>
YC_FOLDER_ID=<folder_id>
YC_REGISTRY_ID=<registry_id>
YC_RUNTIME_SA_ID=<runtime_service_account_id>
YC_API_CONTAINER_NAME=ion-gift-card-api
YC_BOT_CONTAINER_NAME=ion-gift-card-bot
YC_LOCKBOX_SECRET_ID=<lockbox_secret_id>

DB_HOST=<db_host>
DB_PORT=<db_port>
DB_NAME=ion_gift_card
DB_USER=ion_user
DB_PASSWORD=<db_password>

TELEGRAM_BOT_TOKEN=<bot_token>
TELEGRAM_WEBHOOK_SECRET=<same_random_secret_as_lockbox>
TELEGRAM_WEBHOOK_URL=<bot_container_url_without_trailing_slash>
```

Опционально добавьте GitHub environment variables:

```text
DB_POOL_MIN=0
DB_POOL_MAX=2
```

Почему часть секретов дублируется:

- Runtime API/bot containers читают `DB_*`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `WEB_APP_URL` из Lockbox.
- Migration step выполняется в GitHub Actions runner, поэтому ему нужны `DB_*` как GitHub secrets.
- Telegram webhook registration выполняется в GitHub Actions runner, поэтому ему нужны `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL` как GitHub secrets.

## 10. Запустить первый релиз

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
2. Login в Yandex Container Registry.
3. Build/push images:
   - `ion-gift-card-api`
   - `ion-gift-card-bot-webhook`
   - `ion-gift-card-migrations`
4. Запуск миграций.
5. Deploy API Serverless Container.
6. Deploy bot webhook Serverless Container.
7. Регистрацию Telegram webhook.

## 11. Проверить после релиза

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

## 12. Что улучшить после первого запуска

- Закрыть публичный доступ к PostgreSQL.
- Добавить `revision-network-id` в `.github/workflows/release.yml`.
- Перенести миграции в Yandex Cloud network, чтобы GitHub runner не ходил в БД напрямую.
- Рассмотреть Workload Identity Federation вместо долгоживущего `YC_SA_JSON_CREDENTIALS`.
