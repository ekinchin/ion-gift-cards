# Transaction Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add soft receipt confirmation for card `CREATE`, `DEBIT`, and `CREDIT` operations, including fiscal QR parsing, receipt persistence, bot attachment flow, and customer history display rules.

**Architecture:** Keep `transactions` as the card ledger and add `transaction_receipts` as a separate proof layer. Receipt parsing and validation live in focused application modules, repositories own Knex access, and Telegram remains an adapter that asks operators for a receipt after a ledger operation. Customer history displays receipt state for `DEBIT` and `CREDIT`, while `CREATE` receipts remain operator-only.

**Tech Stack:** Node.js 24, TypeScript, grammY, Knex/PostgreSQL, Zod, `node:test`.

---

### Task 1: Receipt Configuration

**Files:**
- Modify: `src/configuration/configuration-service.ts`
- Test: `test/configuration-service.test.ts`

- [x] **Step 1: Write failing tests**

Add tests that prove receipt configuration defaults to soft local mode, parses comma-separated INNs, rejects invalid modes, and reads `RECEIPT_MAX_AGE_MINUTES`.

- [x] **Step 2: Run RED**

Run: `npm test -- test/configuration-service.test.ts`

Expected: fail because `getReceiptConfig` and the `receipt` config section do not exist.

- [x] **Step 3: Implement configuration**

Add `receipt` to `configurationSchema` with:

```ts
mode: z.enum(['soft', 'required']).default('soft')
allowedInns: comma-separated string transformed to string[]
maxAgeMinutes: positive integer default 60
onlineVerification: z.enum(['disabled', 'enabled']).default('disabled')
provider: z.enum(['none', 'fns', 'ofd']).default('none')
```

Add `ReceiptConfig` type and `getReceiptConfig()`.

- [x] **Step 4: Run GREEN**

Run: `npm test -- test/configuration-service.test.ts`

Expected: pass.

### Task 2: Database and Repository

**Files:**
- Create: `src/db/migrations/004_transaction_receipts.sql`
- Create: `src/repositories/transaction-receipt.repository.ts`
- Modify: `src/types/index.ts`
- Modify: `test/helpers/db.ts`
- Test: `test/transaction-receipt.repository.test.ts`
- Test: `test/migrations.run.test.ts`

- [x] **Step 1: Write failing repository tests**

Cover creating receipt records, finding by transaction ids, enforcing one receipt per transaction, and enforcing unique fiscal fingerprint for non-skipped receipts.

- [x] **Step 2: Run RED**

Run: `npm test -- test/transaction-receipt.repository.test.ts test/migrations.run.test.ts`

Expected: fail because migration/table/repository do not exist.

- [x] **Step 3: Implement migration and repository**

Create `transaction_receipts` with:

```text
id uuid primary key default gen_random_uuid()
transaction_id uuid not null unique references transactions(id) on delete cascade
raw_qr_payload text
receipt_url text
fiscal_fn text
fiscal_fd text
fiscal_fp text
fiscal_operation_type text
fiscal_fingerprint text
receipt_issued_at timestamp
receipt_total decimal(10,2)
receipt_inn text
verification_status text not null check (...)
verification_error text
skip_reason text
skip_comment text
created_by_operator_id uuid references operators(id)
created_at timestamp default now()
verified_at timestamp
```

Add a partial unique index on `fiscal_fingerprint where fiscal_fingerprint is not null`.

- [x] **Step 4: Run GREEN**

Run: `npm test -- test/transaction-receipt.repository.test.ts test/migrations.run.test.ts`

Expected: pass.

### Task 3: Fiscal QR Parser and Validator

**Files:**
- Create: `src/application/receipt-qr.ts`
- Create: `src/application/receipt-verification.ts`
- Modify: `src/application/errors.ts`
- Test: `test/receipt-qr.test.ts`
- Test: `test/receipt-verification.test.ts`

- [x] **Step 1: Write failing parser tests**

Cover QR payloads like `t=20260629T1200&s=500.00&fn=123&fd=456&fp=789&n=1`, equivalent `i=456`, URL-encoded values, invalid QR, fingerprint creation, and URL creation from fiscal fields.

- [x] **Step 2: Write failing validator tests**

Cover age window, allowed INN, duplicate fingerprint, `DEBIT` without amount comparison, `CREATE` and `CREDIT` requiring amount equality, fixed skip reasons, and `other` requiring a comment.

- [x] **Step 3: Run RED**

Run: `npm test -- test/receipt-qr.test.ts test/receipt-verification.test.ts`

Expected: fail because modules do not exist.

- [x] **Step 4: Implement parser and validator**

Implement pure functions:

```ts
parseFiscalReceiptQr(raw: string): ParsedFiscalReceiptQr
buildFiscalFingerprint(parsed: ParsedFiscalReceiptQr): string
buildReceiptUrl(parsed: ParsedFiscalReceiptQr): string
validateReceiptForTransaction(input): ReceiptVerificationResult
validateReceiptSkip(input): ReceiptVerificationResult
```

Use `pending_verification` when online verification is disabled and local checks pass. Do not ever return `verified` without online verification.

- [x] **Step 5: Run GREEN**

Run: `npm test -- test/receipt-qr.test.ts test/receipt-verification.test.ts`

Expected: pass.

### Task 4: Application Use Case

**Files:**
- Create: `src/application/transaction-receipt.use-cases.ts`
- Modify: `src/services/index.ts`
- Test: `test/transaction-receipt.use-cases.test.ts`

- [x] **Step 1: Write failing use-case tests**

Cover attaching a scanned receipt to an existing `CREATE`, `DEBIT`, or `CREDIT` transaction, skipping with a reason, rejecting duplicate receipts, saving wrong `CREDIT`/`CREATE` totals as `failed`, and allowing `DEBIT` with a lower receipt total.

- [x] **Step 2: Run RED**

Run: `npm test -- test/transaction-receipt.use-cases.test.ts`

Expected: fail because the use case does not exist.

- [x] **Step 3: Implement use case**

Add `TransactionReceiptUseCases` with `attachReceipt` and `skipReceipt`. It loads the transaction, applies parser/validator, writes `transaction_receipts`, and returns the saved record.

- [x] **Step 4: Run GREEN**

Run: `npm test -- test/transaction-receipt.use-cases.test.ts`

Expected: pass.

### Task 5: Operation Results and Bot Attachment Flow

**Files:**
- Modify: `src/repositories/transaction.repository.ts`
- Modify: `src/application/card.use-cases.ts`
- Modify: `src/bot/context.ts`
- Modify: `src/bot/scan-web-app.ts`
- Modify: `src/bot/handlers/card-operation-command.ts`
- Modify: `src/bot/handlers/commands/create.ts`
- Modify: `src/bot/handlers/menu-handlers.ts`
- Modify: `src/bot/handlers/messages.ts`
- Test: `test/card.use-cases.test.ts`
- Test: `test/bot.scan-web-app.test.ts`
- Test: `test/bot.receipt-flow.test.ts`

- [x] **Step 1: Write failing tests**

Cover `createCard`, `debit`, and `credit` returning the created transaction id; bot storing a pending receipt request after each operation; scanning receipt QR attaching to that transaction; and skipping with a fixed reason.

- [x] **Step 2: Run RED**

Run: `npm test -- test/card.use-cases.test.ts test/bot.scan-web-app.test.ts test/bot.receipt-flow.test.ts`

Expected: fail because operation results and receipt scan actions do not exist.

- [x] **Step 3: Implement minimal bot flow**

Change mutation use cases to return `{ card, transaction }`. Add receipt scan actions, pending receipt session state, and messages asking the operator to scan a receipt or send a skip reason. Preserve current card QR replies.

- [x] **Step 4: Run GREEN**

Run: `npm test -- test/card.use-cases.test.ts test/bot.scan-web-app.test.ts test/bot.receipt-flow.test.ts`

Expected: pass.

### Task 6: History Display

**Files:**
- Modify: `src/repositories/transaction-receipt.repository.ts`
- Modify: `src/application/card-ownership.use-cases.ts`
- Modify: `src/bot/handlers/card-replies.ts`
- Test: `test/card-ownership.use-cases.test.ts`
- Test: `test/bot.receipt-history.test.ts`

- [x] **Step 1: Write failing tests**

Cover owned history including receipt summaries for `DEBIT` and `CREDIT`, hiding `CREATE` receipt links from owners, hiding `skip_reason` from owners, and exposing enough data for operator history.

- [x] **Step 2: Run RED**

Run: `npm test -- test/card-ownership.use-cases.test.ts test/bot.receipt-history.test.ts`

Expected: fail because history does not include receipt summaries.

- [x] **Step 3: Implement history receipt summaries**

Load receipts by transaction ids and attach a view model with public fields for customer history. Keep operator-only fields out of customer replies.

- [x] **Step 4: Run GREEN**

Run: `npm test -- test/card-ownership.use-cases.test.ts test/bot.receipt-history.test.ts`

Expected: pass.

### Task 7: Documentation and Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture-ru.md`
- Modify: `docs/architecture.md`
- Modify: `docs/terms-of-use-ru.md`

- [x] **Step 1: Update docs**

Document the receipt flow, soft mode, config variables, `CREATE` receipt privacy, and customer-visible history behavior.

- [x] **Step 2: Run full verification**

Run:

```bash
npm run typecheck
npm test
```

Expected: both commands exit 0.

- [x] **Step 3: Commit**

Commit implementation and docs with a clear message after verification passes.
