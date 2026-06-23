# Gift Card Architecture Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the project a stricter modular monolith with reliable operator identity, transactional card operations, validated inputs, and test coverage around the money flows.

**Architecture:** Keep the current API, bot, service, repository shape, but tighten the boundaries. HTTP and Telegram remain adapters; application services own use cases and transaction boundaries; repositories own Knex queries; domain helpers own money and card-code invariants.

**Tech Stack:** Node.js 24, TypeScript, Fastify, grammY, Knex, PostgreSQL, Docker Compose, built-in `node:test` for initial integration and unit tests.

---

## Target File Structure

```text
src/
  api/
    routes.ts                  # HTTP adapter only
    schemas.ts                 # Fastify runtime schemas
  application/
    card.use-cases.ts          # create/debit/credit/history use cases
    errors.ts                  # typed application/domain errors
    money.ts                   # minor-unit money helpers
  bot/
    index.ts                   # Telegram adapter only
  db/
    knex.ts
    migrations/
      001_initial.sql
      run.ts
  repositories/
    card.repository.ts         # card persistence, including row locking
    operator.repository.ts     # operator lookup
    transaction.repository.ts  # transaction persistence
  services/
    index.ts                   # composition root for repositories/use cases
  types/
    index.ts                   # shared persistence-facing types
test/
  helpers/
    db.ts                      # test DB helpers
  card.use-cases.test.ts
  api.routes.test.ts
```

## Non-Goals

- Do not split the project into microservices.
- Do not introduce a large framework or full DDD folder hierarchy.
- Do not change public API routes unless the task explicitly says so.
- Do not replace Knex.

## Task 1: Add A Test Command And Baseline Test Harness

**Files:**

- Modify: `package.json`
- Create: `test/helpers/db.ts`
- Create: `test/card.use-cases.test.ts`

- [ ] **Step 1: Add a test script**

Modify `package.json` scripts:

```json
{
  "scripts": {
    "start": "node --experimental-strip-types src/index.ts",
    "dev": "node --experimental-strip-types --watch src/index.ts",
    "typecheck": "tsc --noEmit",
    "db:migrate": "node --experimental-strip-types src/db/migrations/run.ts",
    "bot": "node --experimental-strip-types src/bot/index.ts",
    "test": "node --experimental-strip-types --test test/**/*.test.ts"
  }
}
```

- [ ] **Step 2: Add test database helper**

Create `test/helpers/db.ts`:

```ts
import { db } from '../../src/db/knex.ts';

export async function resetDatabase() {
  await db('transactions').delete();
  await db('cards').delete();
  await db('operators').delete();
}

export async function closeDatabase() {
  await db.destroy();
}
```

- [ ] **Step 3: Add a smoke test that documents current service construction**

Create `test/card.use-cases.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardService } from '../src/services/index.ts';

test('card service is available from composition root', () => {
  assert.equal(typeof cardService.getBalance, 'function');
  assert.equal(typeof cardService.debit, 'function');
  assert.equal(typeof cardService.credit, 'function');
});
```

- [ ] **Step 4: Run verification**

Run:

```bash
npm run typecheck
npm test
```

Expected:

- `npm run typecheck` still fails until Task 2 fixes bot typing.
- `npm test` passes the smoke test without requiring PostgreSQL.

- [ ] **Step 5: Commit**

```bash
git add package.json test/helpers/db.ts test/card.use-cases.test.ts
git commit -m "test: add baseline test harness"
```

## Task 2: Fix Current TypeScript Breakages

**Files:**

- Modify: `src/bot/index.ts`

- [ ] **Step 1: Fix grammY session typing**

Change imports and context typing:

```ts
import { Bot, Context, session, type SessionFlavor } from 'grammy';
```

```ts
type MyContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<MyContext>(token);
```

- [ ] **Step 2: Fix `/create` amount parsing**

Replace:

```ts
const amountStr = parts.at(0);
```

with:

```ts
const [amountStr] = parts;
```

- [ ] **Step 3: Run verification**

Run:

```bash
npm run typecheck
npm test
```

Expected:

- `npm run typecheck` exits with code 0.
- `npm test` exits with code 0.

- [ ] **Step 4: Commit**

```bash
git add src/bot/index.ts
git commit -m "fix: restore bot type safety"
```

## Task 3: Fix Operator Identity Boundary

**Files:**

- Modify: `src/db/migrations/001_initial.sql`
- Modify: `src/bot/index.ts`
- Modify: `src/services/card.service.ts`
- Modify: `src/repositories/transaction.repository.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Fix database operator foreign key type**

In `src/db/migrations/001_initial.sql`, replace:

```sql
operator_id TEXT REFERENCES operators(id),
```

with:

```sql
operator_id UUID REFERENCES operators(id),
```

- [ ] **Step 2: Return operator record instead of boolean in the bot**

Replace `isOperator`:

```ts
async function getOperator(telegramId: number) {
  return operatorRepository.findByTelegramId(telegramId);
}
```

Update `/start`:

```ts
const operator = await getOperator(ctx.from?.id || 0);
if (operator) {
```

- [ ] **Step 3: Pass `operator.id` into use cases**

For `/debit`, `/credit`, and `/create`, resolve once:

```ts
const operator = await getOperator(ctx.from?.id || 0);
if (!operator) {
  await ctx.reply('❌ У вас нет прав для этой операции');
  return;
}
```

Then pass `operator.id`:

```ts
await cardService.debit(code, amount, operator.id, description);
await cardService.credit(code, amount, operator.id, description);
await cardService.createCard(code, amount, operator.id);
```

- [ ] **Step 4: Run verification**

Run:

```bash
npm run typecheck
npm test
```

Expected:

- Both commands exit with code 0.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/001_initial.sql src/bot/index.ts src/services/card.service.ts src/repositories/transaction.repository.ts src/types/index.ts
git commit -m "fix: use operator primary key for transactions"
```

## Task 4: Introduce Application Errors

**Files:**

- Create: `src/application/errors.ts`
- Modify: `src/services/card.service.ts`
- Modify: `src/api/routes.ts`
- Modify: `src/bot/index.ts`

- [ ] **Step 1: Add typed errors**

Create `src/application/errors.ts`:

```ts
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

export class CardNotFoundError extends AppError {
  constructor() {
    super('Card not found', 'CARD_NOT_FOUND', 404);
  }
}

export class DuplicateCardError extends AppError {
  constructor() {
    super('Card with this code already exists', 'DUPLICATE_CARD', 409);
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(current: number, required: number) {
    super(
      `Insufficient balance. Current: ${current}, Required: ${required}`,
      'INSUFFICIENT_BALANCE',
      400
    );
  }
}

export class InvalidAmountError extends AppError {
  constructor() {
    super('Amount must be greater than zero', 'INVALID_AMOUNT', 400);
  }
}
```

- [ ] **Step 2: Replace generic service errors**

In `src/services/card.service.ts`, import the typed errors and replace:

```ts
throw new Error('Card not found');
```

with:

```ts
throw new CardNotFoundError();
```

Replace duplicate and insufficient balance errors with `DuplicateCardError` and `InsufficientBalanceError`.

- [ ] **Step 3: Centralize API error mapping**

In `src/api/routes.ts`, add:

```ts
import { AppError } from '../application/errors.ts';

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
    });
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' });
}
```

Also update the Fastify import:

```ts
import type { FastifyInstance, FastifyReply } from 'fastify';
```

Then replace repeated `catch` blocks with:

```ts
return sendError(reply, error);
```

- [ ] **Step 4: Run verification**

Run:

```bash
npm run typecheck
npm test
```

Expected:

- Both commands exit with code 0.

- [ ] **Step 5: Commit**

```bash
git add src/application/errors.ts src/services/card.service.ts src/api/routes.ts src/bot/index.ts
git commit -m "refactor: introduce application errors"
```

## Task 5: Move Card Use Cases Into Application Layer

**Files:**

- Create: `src/application/card.use-cases.ts`
- Modify: `src/services/index.ts`
- Keep: `src/services/card.service.ts` during transition

- [ ] **Step 1: Create the new application service file**

Create `src/application/card.use-cases.ts` by moving the current `CardService` class from `src/services/card.service.ts` into this file and renaming it:

```ts
export class CardUseCases {
  // same constructor and methods as CardService after Task 4
}
```

- [ ] **Step 2: Keep backward-compatible export during migration**

Modify `src/services/card.service.ts`:

```ts
export { CardUseCases as CardService } from '../application/card.use-cases.ts';
```

- [ ] **Step 3: Update composition root**

In `src/services/index.ts`, import from the application layer:

```ts
import { CardUseCases } from '../application/card.use-cases.ts';
```

Then instantiate:

```ts
export const cardService = new CardUseCases(cardRepository, transactionRepository);
```

- [ ] **Step 4: Run verification**

Run:

```bash
npm run typecheck
npm test
```

Expected:

- Both commands exit with code 0.

- [ ] **Step 5: Commit**

```bash
git add src/application/card.use-cases.ts src/services/card.service.ts src/services/index.ts
git commit -m "refactor: move card use cases to application layer"
```

## Task 6: Add Transaction Boundary To Card Mutations

**Files:**

- Modify: `src/application/card.use-cases.ts`
- Modify: `src/repositories/card.repository.ts`
- Modify: `src/repositories/transaction.repository.ts`

- [ ] **Step 1: Allow repositories to use a transaction client**

In repository methods, accept an optional Knex transaction object:

```ts
import type { Knex } from 'knex';
import { db } from '../db/knex.ts';

function client(trx?: Knex.Transaction) {
  return trx ?? db;
}
```

Use `client(trx)('cards')` and `client(trx)('transactions')` inside methods.

- [ ] **Step 2: Add row locking for card lookup**

Add to `CardRepository`:

```ts
async findByCodeForUpdate(code: string, trx: Knex.Transaction): Promise<Card | null> {
  const card = await trx('cards')
    .where({ code, is_active: true })
    .forUpdate()
    .first();

  return card || null;
}
```

- [ ] **Step 3: Wrap create/debit/credit in `db.transaction`**

In `src/application/card.use-cases.ts`, import `db`:

```ts
import { db } from '../db/knex.ts';
```

For `debit`, use:

```ts
return db.transaction(async (trx) => {
  const card = await this.#cardRepo.findByCodeForUpdate(code, trx);
  if (!card) {
    throw new CardNotFoundError();
  }

  const currentBalance = Number(card.balance);
  if (currentBalance < amount) {
    throw new InsufficientBalanceError(currentBalance, amount);
  }

  const newBalance = currentBalance - amount;
  await this.#cardRepo.updateBalance(card.id, newBalance, trx);

  await this.#txRepo.create({
    cardId: card.id,
    type: 'DEBIT',
    amount,
    balanceAfter: newBalance,
    description: description || 'Purchase',
    operatorId,
  }, trx);

  return { ...card, balance: newBalance };
});
```

Apply the same transaction pattern to `createCard` and `credit`.

- [ ] **Step 4: Run verification**

Run:

```bash
npm run typecheck
npm test
```

Expected:

- Both commands exit with code 0.

- [ ] **Step 5: Commit**

```bash
git add src/application/card.use-cases.ts src/repositories/card.repository.ts src/repositories/transaction.repository.ts
git commit -m "refactor: make card mutations transactional"
```

## Task 7: Add Runtime Validation For API Inputs

**Files:**

- Create: `src/api/schemas.ts`
- Modify: `src/api/routes.ts`

- [ ] **Step 1: Create Fastify schemas**

Create `src/api/schemas.ts`:

```ts
export const cardCodeParamsSchema = {
  type: 'object',
  required: ['code'],
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;

export const createCardBodySchema = {
  type: 'object',
  required: ['code', 'amount', 'operatorId'],
  additionalProperties: false,
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 128 },
    amount: { type: 'number', exclusiveMinimum: 0 },
    operatorId: { type: 'string', format: 'uuid' },
  },
} as const;

export const mutateCardBodySchema = {
  type: 'object',
  required: ['amount', 'operatorId'],
  additionalProperties: false,
  properties: {
    amount: { type: 'number', exclusiveMinimum: 0 },
    operatorId: { type: 'string', format: 'uuid' },
    description: { type: 'string', maxLength: 500 },
  },
} as const;
```

- [ ] **Step 2: Attach schemas to routes**

In `src/api/routes.ts`, import schemas and add `schema` route options:

```ts
app.post('/api/cards', {
  schema: {
    body: createCardBodySchema,
  },
}, async (request, reply) => {
  // existing handler
});
```

Apply `params: cardCodeParamsSchema` to card-code routes and `body: mutateCardBodySchema` to debit/credit routes.

- [ ] **Step 3: Run verification**

Run:

```bash
npm run typecheck
npm test
```

Expected:

- Both commands exit with code 0.

- [ ] **Step 4: Commit**

```bash
git add src/api/schemas.ts src/api/routes.ts
git commit -m "feat: validate API request inputs"
```

## Task 8: Add Database-Level Domain Constraints

**Files:**

- Modify: `src/db/migrations/001_initial.sql`
- Modify: `test/card.use-cases.test.ts`

- [ ] **Step 1: Add database checks**

In `src/db/migrations/001_initial.sql`, update table definitions:

```sql
balance DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
initial_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (initial_amount >= 0),
```

```sql
card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
balance_after DECIMAL(10,2) NOT NULL CHECK (balance_after >= 0),
```

- [ ] **Step 2: Add test cases for invalid amounts**

In `test/card.use-cases.test.ts`, add unit-level assertions around the use case once test DB wiring is available:

```ts
test('debit rejects non-positive amounts', async () => {
  await assert.rejects(
    () => cardService.debit('CARD-1', 0, '00000000-0000-0000-0000-000000000000'),
    /Amount must be greater than zero/
  );
});
```

- [ ] **Step 3: Run verification**

Run:

```bash
npm run typecheck
npm test
```

Expected:

- Both commands exit with code 0.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/001_initial.sql test/card.use-cases.test.ts
git commit -m "fix: enforce database money constraints"
```

## Task 9: Add Real Operator Authorization For API

**Files:**

- Create: `src/api/auth.ts`
- Modify: `src/api/routes.ts`
- Modify: `src/services/index.ts`

- [ ] **Step 1: Add a minimal API key based operator resolver**

Create `src/api/auth.ts`:

```ts
import type { FastifyRequest } from 'fastify';
import { operatorRepository } from '../services/index.ts';

export async function requireOperator(request: FastifyRequest) {
  const telegramIdHeader = request.headers['x-operator-telegram-id'];
  const telegramId = Number(Array.isArray(telegramIdHeader) ? telegramIdHeader[0] : telegramIdHeader);

  if (!Number.isFinite(telegramId)) {
    return null;
  }

  return operatorRepository.findByTelegramId(telegramId);
}
```

- [ ] **Step 2: Remove trusted `operatorId` from request bodies**

In `src/api/routes.ts`, resolve operator in operator routes:

```ts
const operator = await requireOperator(request);
if (!operator) {
  return reply.status(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
}
```

Then pass `operator.id` to use cases.

- [ ] **Step 3: Update schemas**

Remove `operatorId` from `createCardBodySchema` and `mutateCardBodySchema`.

- [ ] **Step 4: Run verification**

Run:

```bash
npm run typecheck
npm test
```

Expected:

- Both commands exit with code 0.

- [ ] **Step 5: Commit**

```bash
git add src/api/auth.ts src/api/routes.ts src/api/schemas.ts src/services/index.ts
git commit -m "feat: resolve API operator server-side"
```

## Task 10: Update Documentation And Audit Trail

**Files:**

- Modify: `README.md`
- Modify: `PLAN.MD`
- Create: `docs/architecture.md`

- [ ] **Step 1: Document the intended architecture**

Create `docs/architecture.md`:

```md
# Architecture

The project is a modular monolith.

HTTP API and Telegram bot are adapters. They parse external input, authenticate operators, and call application use cases.

Application use cases own business operations and database transaction boundaries.

Repositories own Knex queries and never decide business rules.

Database constraints protect critical invariants for balances, transaction amounts, and foreign keys.
```

- [ ] **Step 2: Update README runtime version**

Align `README.md` with `package.json` and Docker:

```md
- **Runtime**: Node.js 24 with `--experimental-strip-types`
```

- [ ] **Step 3: Update operator API docs**

Document that mutating API routes require operator resolution through request headers or the chosen auth mechanism from Task 9.

- [ ] **Step 4: Run verification**

Run:

```bash
npm run typecheck
npm test
```

Expected:

- Both commands exit with code 0.

- [ ] **Step 5: Commit**

```bash
git add README.md PLAN.MD docs/architecture.md
git commit -m "docs: document refactored architecture"
```

## Final Verification

After all tasks:

```bash
npm run typecheck
npm test
npm audit --omit=dev
```

Expected:

- TypeScript check passes.
- Test suite passes.
- Dependency audit has no high severity vulnerabilities after dependency updates are applied.

## Execution Notes

- Execute tasks in order.
- Keep commits small and reversible.
- Do not combine architecture movement with behavior changes unless the task explicitly couples them.
- If a task reveals a failing migration or test-environment issue, stop and fix that before continuing to the next task.

