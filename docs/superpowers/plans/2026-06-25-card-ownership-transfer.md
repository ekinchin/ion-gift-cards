# Card Ownership Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement provider-neutral customer card ownership and owner-initiated card transfers.

**Architecture:** Keep Telegram details in the bot adapter. Add repositories and use cases that operate on internal `customer.id`, `cards.id`, and provider-neutral identity records. Preserve existing public `cards.code` workflows for operators and legacy balance/history lookup.

**Tech Stack:** Node.js 24 strip-types, TypeScript, Knex, PostgreSQL, grammY, node:test.

---

### Task 1: Database and Types

**Files:**
- Modify: `src/db/migrations/001_initial.sql`
- Modify: `src/types/index.ts`
- Modify: `test/helpers/db.ts`

- [x] Add `customers`, `customer_identities`, `card_owners`, `card_transfer_tokens`, and `card_owner_transfers` tables with SQL comments and indexes.
- [x] Add TypeScript interfaces for the new rows.
- [x] Extend test reset cleanup order for the new tables.
- [x] Run `npm run typecheck`.

### Task 2: Ownership Repositories

**Files:**
- Create: `src/repositories/customer.repository.ts`
- Create: `src/repositories/card-ownership.repository.ts`
- Modify: `src/services/index.ts`
- Test: `test/customer.repository.test.ts`

- [x] Write failing repository tests for resolving an identity and linking ownership.
- [x] Implement repository methods for resolve/create identity, card owner lookup, link, transfer tokens, ownership transfer, and listing owned cards.
- [x] Run focused tests and typecheck.

### Task 3: Ownership Use Cases

**Files:**
- Create: `src/application/card-ownership.use-cases.ts`
- Modify: `src/application/errors.ts`
- Modify: `src/services/index.ts`
- Test: `test/card-ownership.use-cases.test.ts`

- [x] Write failing use-case tests for initial link, duplicate link rejection, list cards, start transfer, accept transfer, and invalid transfer cases.
- [x] Implement application use cases with transaction boundaries.
- [x] Run focused tests and typecheck.

### Task 4: Telegram Bot Integration

**Files:**
- Modify: `src/bot/index.ts`
- Modify: `src/bot/menu.ts`
- Modify: `src/bot/scan-web-app.ts`
- Test: `test/bot.scan-web-app.test.ts`

- [x] Extend scan actions with `link`.
- [x] Add bot commands `/link`, `/mycards`, `/transfer`, and `/accept_transfer`.
- [x] Add helper to resolve Telegram user to provider-neutral customer.
- [x] Keep operator debit/credit/create flows unchanged.
- [x] Run bot-related tests and typecheck.

### Task 5: Documentation and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md` if implementation details differ from accepted design.

- [x] Document new customer commands.
- [x] Run `npm test`.
- [x] Run `npm run typecheck`.
