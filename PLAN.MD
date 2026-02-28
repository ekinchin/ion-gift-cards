# Ion Gift Card — Архитектура

## ✅ Реализовано

### Стек технологий

| Компонент | Технология |
|-----------|------------|
| Runtime | Node.js 22+ с --experimental-strip-types |
| Язык | TypeScript |
| API | Fastify |
| БД | PostgreSQL |
| Query Builder | Knex.js (Repository pattern) |
| Telegram Bot | grammY |

### Структура проекта

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
├── repositories/           # Repository pattern + Knex
│   ├── CardRepository.ts
│   ├── TransactionRepository.ts
│   └── OperatorRepository.ts
├── services/
│   ├── CardService.ts      # Бизнес-логика
│   └── index.ts
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
