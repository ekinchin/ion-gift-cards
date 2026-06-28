# Owned Card Default Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make customer-facing bot actions use the current linked card by default and protect owned-card history from public-code reads.

**Architecture:** Keep ownership decisions in `CardOwnershipUseCases`, with bot adapters resolving the current Telegram customer and operator status before calling application methods. Keep public balance bearer-style, but route owned-card history through explicit owner/operator authorization. Bot menu handlers should branch on whether the customer already owns a card before prompting for QR.

**Tech Stack:** Node.js 24, TypeScript, grammY, Knex, `node:test`.

---

### Task 1: Ownership History Authorization

**Files:**
- Modify: `src/application/card-ownership.use-cases.ts`
- Modify: `src/application/errors.ts`
- Test: `test/card-ownership.use-cases.test.ts`

- [x] **Step 1: Write failing tests**

Add tests for reading history by public code when a card is unowned, owned by the requester, owned by another customer, and accessed by an operator.

- [x] **Step 2: Run focused test to verify RED**

Run: `npm test -- test/card-ownership.use-cases.test.ts`

Expected: fail because the public-code history authorization method does not exist.

- [x] **Step 3: Implement application method**

Add a `CardHistoryAccessDeniedError` and a method that loads a card by code, checks `card_owners`, denies non-owner customer access to owned cards unless `operatorId` is present, and returns `{ card, transactions }`.

- [x] **Step 4: Run focused test to verify GREEN**

Run: `npm test -- test/card-ownership.use-cases.test.ts`

Expected: pass.

### Task 2: Bot Personal Actions Default to Current Card

**Files:**
- Modify: `src/bot/menu.ts`
- Modify: `src/bot/handlers/keyboards.ts`
- Modify: `src/bot/handlers/menu-handlers.ts`
- Modify: `src/bot/handlers/commands/link.ts`
- Modify: `src/bot/handlers/commands/unlink.ts`
- Modify: `src/bot/handlers/commands/transfer.ts`
- Modify: `src/bot/handlers/card-replies.ts`
- Test: `test/bot.menu.test.ts`
- Test: `test/bot.keyboards.test.ts`
- Create: `test/bot.owned-card-actions.test.ts`

- [x] **Step 1: Write failing tests**

Add tests proving the menu exposes unlink, menu balance/history call owned-card handlers directly, link does not prompt for scan when a card exists, and unlink without a code replies with QR/card data.

- [x] **Step 2: Run focused bot tests to verify RED**

Run: `npm test -- test/bot.menu.test.ts test/bot.keyboards.test.ts test/bot.owned-card-actions.test.ts`

Expected: fail because unlink is missing from the menu and the new handler behavior is not implemented.

- [x] **Step 3: Implement bot behavior**

Add the unlink menu button, make balance/history menu actions call owned-card replies first, make link check for an existing owned card before opening the scanner, make unlink default to `unlinkCurrentCard`, and make unlink success use `replyWithCardQr` with the unlinked card code and balance.

- [x] **Step 4: Run focused bot tests to verify GREEN**

Run: `npm test -- test/bot.menu.test.ts test/bot.keyboards.test.ts test/bot.owned-card-actions.test.ts`

Expected: pass.

### Task 3: API and Telegram History Use Authorization

**Files:**
- Modify: `src/api/handlers/card-routes.ts`
- Modify: `src/bot/handlers/card-replies.ts`
- Modify: `src/bot/handlers/messages.ts`
- Test: `test/api.card-history-auth.test.ts`
- Test: `test/bot.owned-card-actions.test.ts`

- [x] **Step 1: Write failing tests**

Add tests proving `/api/cards/:code/history` denies access for an owned card without owner/operator identity, allows owner access through `x-customer-telegram-id`, and allows operator access through `x-operator-telegram-id`.

- [x] **Step 2: Run focused API tests to verify RED**

Run: `npm test -- test/api.card-history-auth.test.ts`

Expected: fail because the route still calls `cardService.getHistory(code)` directly.

- [x] **Step 3: Implement route and bot history calls**

Use the ownership history method in the API route and in Telegram history-by-code handlers. Resolve `operatorId` from `getOperator` for Telegram and `requireOperator` for HTTP. Resolve `customerId` from `requireCustomer` only when the header is present.

- [x] **Step 4: Run focused API and bot tests to verify GREEN**

Run: `npm test -- test/api.card-history-auth.test.ts test/bot.owned-card-actions.test.ts`

Expected: pass.

### Task 4: Documentation and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/specs/2026-06-28-owned-card-default-actions-design.md`

- [x] **Step 1: Update docs**

Document that linked-card personal actions default to the current card, unlink returns QR/code/balance for recovery, and owned-card history is owner/operator only.

- [x] **Step 2: Run verification**

Run:

```bash
npm run typecheck
npm test
```

Expected: both commands exit 0.

- [x] **Step 3: Commit**

Commit implementation and tests with a message describing owned-card default actions.
