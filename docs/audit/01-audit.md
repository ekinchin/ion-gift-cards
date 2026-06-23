# Audit 01: Project Review And Resolution Status

Date: 2026-06-23

## Scope

The initial audit reviewed the `ion-gift-card` project structure, API routes, Telegram bot, application services, repositories, database migration, Docker configuration, TypeScript configuration, and dependency state.

This document is now an audit trail: it records the original findings and their current resolution status after the architecture refactoring merged into `main`.

Current verification commands:

```bash
npm run typecheck
npm test
npm audit --omit=dev
```

Current expected result:

- TypeScript check passes.
- Test suite passes.
- Dependency audit reports 0 vulnerabilities.

## Resolved Findings

### Database operator foreign key type

Original finding: `transactions.operator_id` used `TEXT` while referencing `operators.id` of type `UUID`.

Current status: resolved.

Current schema:

```sql
operator_id UUID REFERENCES operators(id)
```

### Operator transaction attribution

Original finding: the Telegram bot checked operators by `telegram_id`, but passed Telegram IDs into card operations.

Current status: resolved.

Current behavior:

- Telegram bot resolves the active operator record.
- Bot card mutations pass `operator.id`.
- API card mutations resolve the active operator server-side before calling use cases.

### Non-atomic money operations

Original finding: debit and credit performed balance update and transaction insert as separate operations.

Current status: resolved.

Current behavior:

- `createCard`, `debit`, and `credit` run inside `db.transaction(...)`.
- `debit` and `credit` lock the card row before calculating the new balance.
- Transaction history is written in the same database transaction as the balance update.

### Missing operator authorization for API mutations

Original finding: operator API routes trusted `operatorId` from request bodies.

Current status: resolved for the current trusted-network model.

Current behavior:

- Mutating API routes require `x-operator-telegram-id`.
- Server resolves the active operator.
- Request bodies must not include `operatorId`.

Remaining note: `x-operator-telegram-id` is a minimal internal mechanism, not strong public API authentication. Use a stronger auth mechanism before exposing the API outside a trusted network.

### Missing API runtime validation

Original finding: API routes cast `request.body` and `request.params` directly to TypeScript types.

Current status: resolved.

Current behavior:

- API validation uses Zod schemas in `src/api/schemas.ts`.
- Controller-level request types use `z.infer` from those schemas.
- Invalid input returns `400` with `VALIDATION_ERROR`.

### TypeScript check failures

Original finding: the Telegram bot failed `npm run typecheck`.

Current status: resolved.

Current behavior:

- grammY session context is typed with `SessionFlavor<SessionData>`.
- `/create` amount parsing no longer passes `string | undefined` into `parseFloat`.

### Vulnerable dependencies

Original finding: dependency audit reported high severity vulnerabilities.

Current status: resolved.

Current behavior:

- `npm audit --omit=dev` reports 0 vulnerabilities.

### Missing tests

Original finding: there were no project tests.

Current status: partially resolved.

Current tests:

- `test/api.auth.test.ts`
- `test/api.schemas.test.ts`
- `test/card.use-cases.test.ts`

Remaining test gap:

- Add PostgreSQL integration tests for migrations and real card operations.
- Add Fastify route tests with `app.inject`.
- Add concurrency tests for parallel debit attempts.

### Documentation/runtime mismatch

Original finding: docs said Node.js 22+ while `package.json` required Node.js 24.x.

Current status: resolved.

Current docs and package metadata target Node.js 24.

## Remaining Risks

### Money representation

Money is still represented as JavaScript `number` in application code.

Current mitigation:

- Zod validates positive request amounts.
- Use cases reject non-finite and non-positive amounts.
- Database constraints reject negative balances and non-positive transaction amounts.

Recommended future improvement:

- Store money as integer minor units, for example kopecks/cents, or introduce a dedicated money value object.

### Migration history

The migration runner still executes `.sql` files directly and does not track applied migrations.

Current mitigation:

- The initial migration is idempotent enough for current local/Docker setup through `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.

Recommended future improvement:

- Use Knex migrations, or add a migration history table.

### API authentication strength

The current API operator resolver uses `x-operator-telegram-id`.

Current mitigation:

- The server resolves the operator record and no longer trusts body-provided `operatorId`.

Recommended future improvement:

- Replace the header-based resolver with token-based or session-based authentication before public deployment.

