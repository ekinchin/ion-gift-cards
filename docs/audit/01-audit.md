# Audit 01: Project Review

Date: 2026-06-23

## Scope

Reviewed the current `ion-gift-card` project structure, API routes, Telegram bot, services, repositories, database migration, Docker configuration, TypeScript configuration, and dependency state.

Commands run:

```bash
npm run typecheck
npm ls --depth=0
npm audit --omit=dev
```

## Critical Findings

### 1. Database migration is likely to fail

`transactions.operator_id` is declared as `TEXT`, but it references `operators.id`, which is `UUID`.

File: `src/db/migrations/001_initial.sql`

```sql
operator_id TEXT REFERENCES operators(id)
```

PostgreSQL foreign keys require compatible column types. This can prevent migrations from completing, which also blocks the Docker startup flow because `api` and `bot` depend on successful migrations.

Recommended fix:

- Change `transactions.operator_id` to `UUID`.
- Ensure application code passes `operators.id`, not Telegram IDs.

### 2. Operator transaction attribution is wrong

The bot checks operator permissions by `telegram_id`, but writes transactions with `String(ctx.from?.id)`.

Affected files:

- `src/bot/index.ts`
- `src/services/card.service.ts`
- `src/repositories/transaction.repository.ts`

This value is a Telegram user ID, not the UUID primary key from `operators.id`. After fixing the database type, transaction inserts will fail unless this is corrected.

Recommended fix:

- Replace boolean `isOperator()` with a function that returns the active operator record.
- Pass `operator.id` to `createCard`, `debit`, and `credit`.

### 3. Money operations are not atomic

`debit` and `credit` perform these steps separately:

1. Read card balance.
2. Calculate new balance in application code.
3. Update card balance.
4. Insert transaction history row.

Affected files:

- `src/services/card.service.ts`
- `src/repositories/card.repository.ts`
- `src/repositories/transaction.repository.ts`

This creates several risks:

- Concurrent debits can overwrite each other.
- A card can be overdrawn under race conditions.
- Balance and transaction history can diverge if one query succeeds and the next fails.

Recommended fix:

- Wrap balance update and transaction insert in a database transaction.
- Lock the card row with `SELECT ... FOR UPDATE`, or use an atomic conditional update.
- Keep insufficient-balance checks inside the same transaction.

### 4. Operator API endpoints have no authorization

The API exposes operator-level actions without authentication or authorization:

- `POST /api/cards`
- `POST /api/cards/:code/debit`
- `POST /api/cards/:code/credit`

Affected file: `src/api/routes.ts`

The API trusts `operatorId` from the request body. Any caller can create cards, debit balances, or credit balances.

Recommended fix:

- Add authentication for operator endpoints.
- Resolve the operator identity on the server side.
- Do not trust `operatorId` from the request body.

### 5. API input validation is missing

The API casts `request.body` and `request.params` directly to TypeScript types without runtime validation.

Affected file: `src/api/routes.ts`

Examples:

- Negative debit amount can increase a balance.
- Negative credit amount can decrease a balance.
- `NaN`, strings, missing fields, or invalid codes can reach service logic.

Recommended fix:

- Add Fastify JSON schemas for params and body.
- Validate `amount > 0`.
- Validate card code format and required fields.
- Return `400` for invalid input before calling services.

## Build And Dependency Findings

### TypeScript check fails

Command:

```bash
npm run typecheck
```

Result:

```text
src/bot/index.ts(19,9): error TS2345: Argument of type 'MiddlewareFn<Context & SessionFlavor<SessionData>>' is not assignable to parameter of type 'Middleware<Context>'.
src/bot/index.ts(132,29): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
```

Recommended fix:

- Type the bot context with `SessionFlavor<SessionData>`.
- Avoid `parts.at(0)` where TypeScript cannot prove a string exists, or guard it explicitly.

### Dependency audit reports high severity vulnerabilities

Command:

```bash
npm audit --omit=dev
```

Result:

```text
3 high severity vulnerabilities

fast-uri <=3.1.1
fastify <=5.8.4
lodash <=4.17.23
```

Recommended fix:

```bash
npm audit fix
```

Then rerun:

```bash
npm run typecheck
npm audit --omit=dev
```

## Medium Risk Findings

### No project tests

No application test files were found. Only test files inside `node_modules` matched the search.

Recommended test coverage:

- Migration applies successfully to PostgreSQL.
- Card creation creates both card and transaction.
- Debit decreases balance and writes history.
- Credit increases balance and writes history.
- Debit rejects insufficient funds.
- Concurrent debit cannot overdraw or lose updates.
- Unauthorized API requests cannot mutate cards.

### Money is represented as JavaScript `number`

Database values use `DECIMAL(10,2)`, but service logic converts balances to JavaScript `number`.

Affected file: `src/services/card.service.ts`

This can introduce rounding issues over time.

Recommended fix:

- Store money as integer minor units, for example kopecks/cents, or use a decimal library consistently.

### Migration runner has no migration history

The migration runner executes every `.sql` file each time and does not track applied migrations.

Affected file: `src/db/migrations/run.ts`

Current migration uses `IF NOT EXISTS`, but future schema changes will be hard to manage safely.

Recommended fix:

- Use Knex migrations, or add a migration history table.

### Documentation and runtime version mismatch

`README.md` says Node.js 22+, but `package.json` requires Node.js 24.x.

Recommended fix:

- Align documentation, Docker image, and `package.json`.

## Recommended Fix Order

1. Fix database schema for `transactions.operator_id` and operator ID flow.
2. Make `createCard`, `debit`, and `credit` atomic database transactions.
3. Add API authentication and runtime validation.
4. Fix TypeScript errors.
5. Update vulnerable dependencies.
6. Add integration tests around database, card operations, and authorization.

