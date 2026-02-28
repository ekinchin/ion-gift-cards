# Ion Gift Card

Система учёта сертификатов (gift cards) для кофейни.

## Возможности

- ✅ Гость может проверить остаток по коду карты
- ✅ Бариста может проверить остаток
- ✅ Бариста может списать сумму при покупке
- ✅ Бариста может пополнить баланс (депозит)
- ✅ История всех операций

## Стек технологий

- **Runtime**: Node.js 22+ с `--experimental-strip-types`
- **Язык**: TypeScript
- **API**: Fastify
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

```bash
# API сервер
npm run dev

# Telegram бот
npm run bot
```

## API Endpoints

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
├── api/
│   └── routes.ts           # API роуты
├── bot/
│   └── index.ts            # Telegram бот
├── db/
│   ├── knex.ts             # Knex инстанс
│   └── migrations/
│       ├── 001_initial.sql # SQL миграции
│       └── run.ts          # Скрипт миграций
├── repositories/
│   ├── CardRepository.ts
│   ├── TransactionRepository.ts
│   └── OperatorRepository.ts
├── services/
│   ├── CardService.ts
│   └── index.ts
├── types/
│   └── index.ts
└── index.ts                # Точка входа API
```

## Добавление оператора

```sql
INSERT INTO operators (telegram_id, name)
VALUES (123456789, 'Имя бариста');
```
