# Ion Gift Card

Система учёта сертификатов (gift cards) для кофейни.

## Возможности

- ✅ Гость может проверить остаток по коду карты
- ✅ Бариста может проверить остаток
- ✅ Бариста может списать сумму при покупке
- ✅ Бариста может пополнить баланс (депозит)
- ✅ Бот показывает QR-код карты при создании и при запросе своей карты
- ✅ История всех операций

## Стек технологий

- **Runtime**: Node.js 24 с `--experimental-strip-types`
- **Язык**: TypeScript
- **API**: Fastify
- **Валидация**: Zod
- **БД**: PostgreSQL + Knex.js
- **Telegram Bot**: grammY

## Установка

```bash
# Установка зависимостей
npm install

# Скопировать и настроить переменные окружения
cp .env.example .env
# Отредактировать .env

# Запустить миграции
npm run db:migrate
```

## Запуск

### Docker (рекомендуется)

```bash
# Создать .env с токеном бота
echo "TELEGRAM_BOT_TOKEN=your_token" > .env

# Запустить все сервисы
docker compose up -d

# Порядок запуска:
# 1. postgres (healthcheck)
# 2. migrations (накатывает схему и завершается)
# 3. api + bot (запускаются после миграций)
```

### Docker + локальный QR-сканер

Для проверки Telegram Mini App на локальной машине нужен публичный HTTPS URL. Локальный override `docker-compose.local.yml` поднимает `cloudflared` tunnel до API-сервиса.

```bash
# 1. Запустить API, БД и tunnel
docker compose -f docker-compose.yml -f docker-compose.local.yml up api tunnel
```

В логах `tunnel` найдите URL вида:

```text
https://example.trycloudflare.com
```

Добавьте его в `.env` с путем `/qr`:

```env
WEB_APP_URL=https://example.trycloudflare.com/qr
```

После этого запустите или перезапустите бота:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d bot
```

Если URL туннеля изменился, обновите `WEB_APP_URL` и перезапустите `bot`.

### Локально

```bash
# API сервер
npm run dev

# Telegram бот
npm run bot
```

Для QR-сканера Telegram Mini App укажите публичный HTTPS URL страницы. В production страница публикуется как статический `qr.html` в Yandex Object Storage, чтобы клиент Telegram не зависел от доступности Serverless Container из сети пользователя:

```bash
WEB_APP_URL=https://storage.yandexcloud.net/<bucket>/qr.html npm run bot
```

Без `WEB_APP_URL` бот продолжит работать без кнопки сканирования.

Подтверждение кассовых операций фискальными чеками настраивается отдельными переменными:

```bash
RECEIPT_MODE=soft
RECEIPT_ALLOWED_INNS=1234567890
RECEIPT_MAX_AGE_MINUTES=60
RECEIPT_ONLINE_VERIFICATION=disabled
RECEIPT_PROVIDER=none
```

В мягком режиме бот проводит `CREATE`, `DEBIT` и `CREDIT`, а затем просит оператора отсканировать QR чека или указать причину пропуска. История владельца показывает чек для списаний и пополнений; чек создания подарочной карты хранится для операторского аудита и не показывается владельцу.

## API Endpoints

Операторские API-запросы требуют заголовок `x-operator-telegram-id` с Telegram ID активного оператора. Сервер сам находит оператора и использует внутренний `operators.id`; передавать `operatorId` в теле запроса не нужно.

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/cards/:code/balance` | Проверить баланс |
| POST | `/api/cards` | Создать карту |
| POST | `/api/cards/:code/debit` | Списать сумму |
| POST | `/api/cards/:code/credit` | Пополнить баланс |
| GET | `/api/cards/:code/history` | История операций |
| GET | `/health` | Health check |

Создание карты принимает только сумму:

```json
{ "amount": 1000 }
```

Публичный код карты формируется сервером в формате `ION-XXXXXXXXXXXX`. QR-код карты кодирует ровно этот публичный код plain text, без ссылок и дополнительных префиксов.

## Telegram Bot команды

После `/start` бот показывает кнопочное меню с основными действиями. Если у аккаунта уже есть привязанная карта, личные действия работают с ней по умолчанию без сканирования QR. Операторские списание и пополнение остаются QR/код-first, чтобы оператор явно выбрал карту клиента.

В Telegram command menu обычные пользователи видят только клиентские команды. Операторские команды публикуются отдельным scope для активных операторов из таблицы `operators`; после добавления нового оператора нужно заново выполнить конфигурацию бота или перезапустить runtime.

- `/start` - Начало работы
- `/balance <код>` - Проверить баланс
- `/balance` - Показать баланс привязанной карты
- `/my_card` - Показать свою привязанную карту с QR-кодом
- `/create_my_card` - Создать личную карту и получить QR-код
- `/link <код>` - Привязать карту к текущему аккаунту
- `/link` - Сканировать QR-код и привязать карту, если у аккаунта ещё нет карты
- `/unlink` - Отвязать текущую карту и получить её QR-код, текстовый код и баланс для восстановления
- `/unlink <код>` - Отвязать указанную карту от текущего аккаунта
- `/transfer` - Создать одноразовый код передачи текущей карты
- `/transfer <код>` - Создать одноразовый код передачи указанной карты
- `/accept_transfer <код_передачи>` - Принять переданную карту
- `/debit <код> <сумма>` - Списать (только для операторов)
- `/debit <сумма>` - Сканировать QR-код и списать (только для операторов)
- `/credit <код> <сумма>` - Пополнить (только для операторов)
- `/credit <сумма>` - Сканировать QR-код и пополнить (только для операторов)
- `/create_gift_card <сумма>` - Создать подарочную карту и получить QR-код (только для операторов)
- `/history <код>` - История операций; для привязанной карты доступна только владельцу или оператору
- `/history` - Показать историю привязанной карты

Гости могут просто отправить код карты текстом для проверки баланса или открыть QR-сканер, если настроен `WEB_APP_URL`. Привязка карты не отменяет предъявительскую модель для баланса и операторских операций: бариста по-прежнему работает с публичным кодом или QR. История привязанной карты приватна: её видит только владелец или оператор. QR, который бот отправляет пользователю, содержит тот же `ION-...` код, поэтому существующий сканер читает его без отдельной логики.

После операторских операций бот просит приложить чек. Допустимые причины пропуска: `qr_unreadable`, `receipt_lost`, `cash_register_without_qr`, `technical_error`, `other <комментарий>`.

Правила использования, термины и зоны ответственности описаны в [docs/terms-of-use-ru.md](docs/terms-of-use-ru.md). Важные правила: за непривязанные карты кофейня ответственности не несёт, если пользователь потерял код/QR, передал его третьему лицу или допустил использование карты другим человеком; внесённые средства можно потратить только на товары и услуги внутри кофейни, карта не является общим средством платежа.

## Структура проекта

```
src/
├── application/
│   ├── card-ownership.use-cases.ts # Привязка и передача карт клиентам
│   ├── card.use-cases.ts   # Сценарии работы с картами
│   └── errors.ts           # Типизированные ошибки приложения
├── api/
│   ├── auth.ts             # Разрешение оператора для API
│   ├── routes.ts           # API роуты
│   └── schemas.ts          # Zod-схемы и выводимые из них типы
├── bot/
│   └── index.ts            # Telegram бот
├── db/
│   ├── knex.ts             # Knex инстанс
│   └── migrations/
│       ├── 001_initial.sql # SQL миграции
│       └── run.ts          # Скрипт миграций
├── repositories/
│   ├── card-ownership.repository.ts
│   ├── card.repository.ts
│   ├── customer.repository.ts
│   ├── transaction.repository.ts
│   └── operator.repository.ts
├── services/
│   ├── card.service.ts     # Совместимый экспорт
│   └── index.ts            # Composition root
├── types/
│   └── index.ts
└── index.ts                # Точка входа API
```

## Проверки

```bash
npm run typecheck
npm test
npm audit --omit=dev
```

## Production deployment

Production deployment to Yandex Cloud is described in [docs/deployment-yandex-cloud.md](docs/deployment-yandex-cloud.md). Releases are tag-based and run through GitHub Actions.

## Добавление оператора

```sql
INSERT INTO operators (telegram_id, name)
VALUES (123456789, 'Имя бариста');
```
