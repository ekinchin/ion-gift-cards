# Ion Gift Card — Архитектура

## ✅ Реализовано

### Стек технологий

| Компонент | Технология |
|-----------|------------|
| Runtime | Node.js 24 с --experimental-strip-types |
| Язык | TypeScript |
| API | Fastify |
| БД | PostgreSQL |
| Query Builder | Knex.js (Repository pattern) |
| Telegram Bot | grammY |

### Структура проекта

```
src/
├── application/
│   ├── card.use-cases.ts   # Application use cases
│   └── errors.ts           # Типизированные ошибки
├── api/
│   ├── auth.ts             # Разрешение оператора
│   ├── routes.ts           # API роуты
│   └── schemas.ts          # Runtime validation schemas
├── bot/
│   └── index.ts            # Telegram бот
├── db/
│   ├── knex.ts             # Knex инстанс
│   └── migrations/
│       ├── 001_initial.sql # SQL миграции
│       └── run.ts          # Скрипт миграций
├── repositories/           # Repository pattern + Knex
│   ├── CardRepository.ts
│   ├── TransactionRepository.ts
│   └── OperatorRepository.ts
├── services/
│   ├── card.service.ts     # Совместимый экспорт
│   └── index.ts            # Composition root
├── types/
│   └── index.ts
└── index.ts                # Точка входа API
```

### Функционал

- ✅ Гость проверяет остаток (API + Bot)
- ✅ Бариста проверяет остаток
- ✅ Бариста списывает сумму (DEBIT)
- ✅ Бариста пополняет баланс (CREDIT)
- ✅ История транзакций
- ✅ Операторские API-запросы разрешают оператора на сервере
- ✅ Мутации карты выполняются в транзакции БД

### Миграции

SQL миграции в `src/db/migrations/*.sql`

### Запуск

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev      # API
npm run bot      # Telegram Bot
```
