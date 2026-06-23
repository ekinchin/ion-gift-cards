# Gift Card Architecture Refactoring Plan

**Status:** Completed and merged into `main`.

**Goal:** Make the project a stricter modular monolith with reliable operator identity, transactional card operations, validated inputs, and test coverage around the money flows.

**Resulting Architecture:** HTTP API and Telegram bot are adapters. Application use cases own business operations and database transaction boundaries. Repositories own Knex queries. API runtime validation uses Zod, and controller-level request types are inferred from Zod schemas with `z.infer`.

**Tech Stack:** Node.js 24, TypeScript, Fastify, Zod, grammY, Knex, PostgreSQL, Docker Compose, built-in `node:test`.

---

## Current File Structure

```text
src/
  api/
    auth.ts                  # Resolves active operators for API requests
    routes.ts                # HTTP adapter
    schemas.ts               # Zod schemas and z.infer request types
  application/
    card.use-cases.ts        # create/debit/credit/history use cases
    errors.ts                # typed application/domain errors
  bot/
    index.ts                 # Telegram adapter
  db/
    knex.ts
    migrations/
      001_initial.sql
      run.ts
  repositories/
    card.repository.ts       # card persistence, including row locking
    operator.repository.ts   # operator lookup
    transaction.repository.ts
  services/
    card.service.ts          # compatibility export
    index.ts                 # composition root
  types/
    index.ts
test/
  helpers/
    db.ts
  api.auth.test.ts
  api.schemas.test.ts
  card.use-cases.test.ts
```

## Completed Tasks

- [x] Added a test command and baseline `node:test` harness.
- [x] Fixed current TypeScript breakages in the Telegram bot.
- [x] Fixed operator identity flow so transactions use `operators.id`, not Telegram IDs.
- [x] Introduced typed application errors and centralized API error mapping.
- [x] Moved card use cases into `src/application/card.use-cases.ts`.
- [x] Added database transaction boundaries to card mutations.
- [x] Added row locking for debit and credit balance updates.
- [x] Added Zod request validation for API inputs.
- [x] Derived controller-level request types from Zod schemas with `z.infer`.
- [x] Removed trusted `operatorId` from API request bodies.
- [x] Added server-side API operator resolution through `x-operator-telegram-id`.
- [x] Added database constraints for balances, transaction amounts, and foreign keys.
- [x] Added tests for API auth, API schemas, and card use cases.
- [x] Updated vulnerable dependencies.
- [x] Updated architecture documentation.

## Current Validation Contract

`src/api/schemas.ts` is the source of truth for API input validation:

```ts
export const cardCodeParamsSchema = z.object({
  code: z.string().min(1).max(128),
}).strict();

export const createCardBodySchema = z.object({
  code: z.string().min(1).max(128),
  amount: z.number().positive(),
}).strict();

export const mutateCardBodySchema = z.object({
  amount: z.number().positive(),
  description: z.string().max(500).optional(),
}).strict();
```

The API layer imports both schemas and inferred types:

```ts
export type CardCodeParams = z.infer<typeof cardCodeParamsSchema>;
export type CreateCardBody = z.infer<typeof createCardBodySchema>;
export type MutateCardBody = z.infer<typeof mutateCardBodySchema>;
```

## Current Operator Contract

Mutating API routes require:

```text
x-operator-telegram-id: <telegram id of an active operator>
```

The server resolves the active operator and passes `operator.id` into application use cases. Request bodies must not contain `operatorId`.

## Verification

Current verification commands:

```bash
npm run typecheck
npm test
npm audit --omit=dev
```

Expected result:

- TypeScript check passes.
- Test suite passes.
- Dependency audit reports 0 vulnerabilities.

## Deferred Improvements

- Add integration tests that run against PostgreSQL and apply migrations.
- Add API route tests with Fastify injection.
- Replace JavaScript `number` money representation with integer minor units or a dedicated money value object.
- Replace the simple `x-operator-telegram-id` operator resolver with a stronger authentication mechanism before exposing the API outside a trusted network.
