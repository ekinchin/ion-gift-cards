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

### Локально

```bash
# API сервер
npm run dev

# Telegram бот
npm run bot
```

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

## Telegram Bot команды

- `/start` - Начало работы
- `/balance <код>` - Проверить баланс
- `/debit <код> <сумма>` - Списать (только для операторов)
- `/credit <код> <сумма>` - Пополнить (только для операторов)
- `/create <код> <сумма>` - Создать карту (только для операторов)
- `/history <код>` - История операций

Гости могут просто отправить код карты текстом для проверки баланса.

## Структура проекта

```
src/
├── application/
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
│   ├── card.repository.ts
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
