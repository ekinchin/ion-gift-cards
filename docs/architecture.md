# Architecture

The project is a modular monolith.

HTTP API and Telegram bot are adapters. They parse external input, authenticate operators, and call application use cases.

API request validation is implemented with Zod in `src/api/schemas.ts`. Controller-level request body and params types are inferred from the same schemas with `z.infer`, so runtime validation and TypeScript types share one source of truth.

Application use cases own business operations and database transaction boundaries. Card mutations run inside `db.transaction(...)`; debit and credit lock the card row before calculating the new balance.

Repositories own Knex queries and never decide business rules.

Database constraints protect critical invariants for balances, transaction amounts, and foreign keys.

Money is still represented as JavaScript `number` in application code. The current architecture protects basic amount invariants through Zod, use-case checks, and database constraints; a dedicated money value object remains a possible future improvement.
