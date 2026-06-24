# Ion Gift Card

Система учёта сертификатов (gift cards) для кофейни.

## Возможности

- ✅ Гость может проверить остаток по коду карты
- ✅ Бариста может проверить остаток
- ✅ Бариста может списать сумму при покупке
- ✅ Бариста может пополнить баланс (депозит)
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

Для QR-сканера Telegram Mini App укажите публичный HTTPS URL страницы `/qr`:

```bash
WEB_APP_URL=https://your-domain.example/qr npm run bot
```

Без `WEB_APP_URL` бот продолжит работать без кнопки сканирования.

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

Публичный код карты формируется сервером в формате `ION-XXXXXXXXXXXX`.

## Telegram Bot команды

После `/start` бот показывает кнопочное меню с основными действиями. Кнопки запускают сканирование QR или подсказывают нужный формат команды.

- `/start` - Начало работы
- `/scan` - Открыть QR-сканер
- `/balance <код>` - Проверить баланс
- `/balance` - Показать баланс привязанной карты, если она одна
- `/mycards` - Показать привязанные карты
- `/link <код>` - Привязать карту к текущему аккаунту
- `/link` - Сканировать QR-код и привязать карту
- `/transfer <код>` - Создать одноразовый код передачи карты
- `/accept_transfer <код_передачи>` - Принять переданную карту
- `/debit <код> <сумма>` - Списать (только для операторов)
- `/debit <сумма>` - Сканировать QR-код и списать (только для операторов)
- `/credit <код> <сумма>` - Пополнить (только для операторов)
- `/credit <сумма>` - Сканировать QR-код и пополнить (только для операторов)
- `/create <сумма>` - Создать карту (только для операторов)
- `/history <код>` - История операций
- `/history` - Показать историю привязанной карты, если она одна

Гости могут просто отправить код карты текстом для проверки баланса или открыть QR-сканер, если настроен `WEB_APP_URL`. Привязка карты не отменяет предъявительскую модель: бариста по-прежнему работает с публичным кодом или QR.

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

## Добавление оператора

```sql
INSERT INTO operators (telegram_id, name)
VALUES (123456789, 'Имя бариста');
```
