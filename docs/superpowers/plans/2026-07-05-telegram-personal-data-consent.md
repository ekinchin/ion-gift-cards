# Telegram Personal Data Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Telegram account binding explicit about personal-data processing, store Telegram identifiers with minimization, and make card unlinking the user-visible withdrawal path that deletes card transaction history.

**Architecture:** Keep card ownership bound to internal `customer_id` / `operator_id` records, not raw Telegram identifiers. Store deterministic `HMAC-SHA256(secret, telegram_user_id)` for identity lookup and store reversible Telegram contact data only when needed for direct notifications. Put consent checks at the bot adapter boundary before personal-card operations, and put unlink cleanup in the application use case so transaction history deletion is enforced for every caller.

**Tech Stack:** Node.js 24, TypeScript, grammY, Knex, PostgreSQL, `node:test`.

---

## System Analysis

### Current State

- `customers.id` is already provider-neutral and can remain the domain identity for card ownership.
- `customer_identities.provider_user_id` currently stores the raw Telegram user id as text.
- `operators.telegram_id` currently stores the raw Telegram user id as `BIGINT`.
- The database already exists in production and migrations are applied forward by numeric SQL files in `src/db/migrations`; do not rewrite `001_initial.sql`.
- Card ownership lives in `card_owners`; ownership changes are audited in `card_owner_transfers`.
- Transaction history lives in `transactions`; receipt metadata for transactions lives in `transaction_receipts`.
- `CardOwnershipUseCases.unlinkCard` and `unlinkCurrentCard` currently remove only the `card_owners` row and add an `OWNER_UNLINK` event.
- User-facing bot copy is centralized in `src/copy.ts`, so consent and destructive-action warnings should be added there and reused by handlers.

### Product Requirements

- Before creating or linking a personal card, the bot must explicitly ask the user for permission to store and process personal data.
- The consent text must be visible in the bot flow, not only in a separate document.
- The consent text must explicitly say that the bot stores and processes Telegram account identifiers to bind the card to the Telegram account and operate personal-card features.
- The consent text must explicitly say that refusal means the user cannot create or link a personal card in Telegram.
- If a user previously consented and now wants to refuse further storage/processing for the linked card, the user-facing action is to unlink the card.
- The unlink confirmation must explicitly say that unlinking withdraws the consent for this card binding.
- The unlink confirmation must explicitly say that transaction history for the card will be deleted.
- Unlinking must delete the card transaction history, not only hide it from the user.
- After unlinking, the bot must still return the card code/QR/balance needed for bearer-style recovery if the card remains active.

### Data Protection Position

This plan treats Telegram user id and private chat id as personal data in this system because they identify or make reachable a specific Telegram account once connected to card ownership and bot actions.

Implementation should minimize raw Telegram identifiers:

- Use internal `customers.id` and `operators.id` for all domain relations.
- Use `telegram_user_id_hmac` for deterministic customer/operator lookup.
- Store the HMAC secret in Yandex Cloud Lockbox and inject it into runtime containers as `TELEGRAM_ID_HMAC_SECRET`.
- Do not store plain `telegram_user_id` in customer identity rows.
- Do not log raw Telegram identifiers.
- Store `encrypted_private_chat_id` only if direct user notifications are implemented.
- Store optional display fields only if the product explicitly needs them; otherwise stop persisting `username` and `display_name`.

HMAC is a risk-reduction and lookup mechanism, not a claim that the data is fully anonymous for the operator.

### Consent Model

Consent is required before personal-card features that bind a Telegram account to a card:

- `/create_my_card`
- `/link`
- link from reply keyboard
- QR/web-app link flow
- `/accept_transfer`

Consent is not required for public bearer-style operations that do not bind the Telegram account to a card:

- `/balance <код>`
- QR/manual balance by public card code
- operator debit/credit/create-gift-card flows

Consent should be stored per customer identity, not per card, because the personal data being stored is the Telegram account identity. The current product requirement makes withdrawal for a linked card happen through card unlinking, so the implementation must also remove or deactivate the identity/contact data when the customer has no linked cards and no other active reason to keep the identity.

### Unlink And History Deletion Model

Unlink is now a destructive privacy operation:

1. Confirm the user wants to unlink.
2. Show that unlinking withdraws consent for this card binding.
3. Show that card transaction history will be deleted.
4. On confirmation, remove current ownership.
5. Delete transaction receipt rows for the card's transactions.
6. Delete transaction rows for the card.
7. Remove or deactivate customer identity/contact rows when there is no remaining active card binding.
8. Return QR/code/balance for the now-unlinked card.

Receipt rows must be deleted before transaction rows to satisfy foreign keys. If receipt tables use `ON DELETE CASCADE` in a future migration, repository cleanup may still explicitly delete receipts first for clarity and compatibility.

### User-Facing Copy Requirements

Consent prompt must include these points in plain Russian:

- The bot will store and process Telegram account data to bind the card to the account.
- The bot will use this data to show the user's card, balance, QR and private history.
- If notification contacts are implemented, the prompt must also say the bot may use Telegram contact data to send service messages about the card.
- The user can refuse by pressing a negative button; in that case personal-card binding will not be created.
- If consent was already given, the user can later refuse further storage/processing by unlinking the card.

Unlink confirmation must include these points in plain Russian:

- The card will be detached from this Telegram account.
- This is treated as refusal from further storage/processing of personal data for this card binding.
- The card transaction history will be deleted and cannot be restored from the bot.
- The bot will show the card QR/code/balance after unlinking so the user can keep bearer-style access.

### Out Of Scope

- A legal policy document ready for publication.
- A full admin interface for data-subject requests.
- Direct marketing or promotional messaging.
- A raffle implementation.
- Figma card updates and PNG exports; update Telegram manual cards in a separate documentation pass if the bot UX changes ship.

---

### Task 1: Forward Migration, Configuration, And Lockbox Secret

**Files:**
- Create: `src/db/migrations/005_telegram_personal_data_consent.sql`
- Modify: `src/types/index.ts`
- Modify: `src/configuration/configuration-service.ts`
- Modify: `.github/workflows/release-polling-vm.yml`
- Modify: `.github/scripts/deploy-yc-polling-vm.sh`
- Modify: `.github/workflows/release.yml`
- Modify: `docs/deployment-yandex-cloud.md`
- Modify: `docs/yandex-cloud-github-setup.ru.md`
- Test: `test/migrations.run.test.ts`
- Test: `test/configuration-service.test.ts`

- [ ] **Step 1: Write migration tests for forward schema migration**

Add assertions to the migration/schema tests proving the customer identity model exposes:

```sql
telegram_user_id_hmac TEXT
personal_data_consent_at TIMESTAMP
personal_data_consent_revoked_at TIMESTAMP
```

and the operator model exposes:

```sql
telegram_user_id_hmac TEXT
```

The test must also prove `src/db/migrations/001_initial.sql` is not edited for this change and that the new migration is applied after `004_transaction_receipts.sql`.

Run: `npm test -- test/migrations.run.test.ts`

Expected: FAIL because migration `005_telegram_personal_data_consent.sql` does not exist yet.

- [ ] **Step 2: Write configuration tests for HMAC secret**

Add tests proving production-like Telegram identity lookup requires a secret supplied through env:

```ts
TELEGRAM_ID_HMAC_SECRET=at-least-32-random-bytes
```

Expected behavior:

- missing secret in active Telegram mode fails configuration validation;
- too-short secret fails configuration validation;
- valid secret is available to identity hashing code.

Run: `npm test -- test/configuration-service.test.ts`

Expected: FAIL because the config does not define this secret.

- [ ] **Step 3: Add forward-only migration**

Create `src/db/migrations/005_telegram_personal_data_consent.sql`. This migration must alter the existing database forward; it must not rewrite `001_initial.sql`.

Add transition columns while keeping raw columns for backfill verification:

```sql
ALTER TABLE customer_identities
    ADD COLUMN IF NOT EXISTS telegram_user_id_hmac TEXT,
    ADD COLUMN IF NOT EXISTS personal_data_consent_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS personal_data_consent_revoked_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_identities_provider_telegram_hmac
    ON customer_identities(provider, telegram_user_id_hmac)
    WHERE telegram_user_id_hmac IS NOT NULL;

ALTER TABLE operators
    ADD COLUMN IF NOT EXISTS telegram_user_id_hmac TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_operators_telegram_user_id_hmac
    ON operators(telegram_user_id_hmac)
    WHERE telegram_user_id_hmac IS NOT NULL;
```

Do not add `NOT NULL` and do not drop `customer_identities.provider_user_id` or `operators.telegram_id` in this migration. Those raw columns are removed only after the backfill is verified.

- [ ] **Step 4: Update TypeScript types**

Update `CustomerIdentity` and `Operator` in `src/types/index.ts` to add HMAC/consent fields. Keep raw identifier fields in DB row types only while the transition columns are still needed for backfill.

- [ ] **Step 5: Update configuration**

Add a validated `telegram.identityHmacSecret` config value. It must be treated as a secret and never logged.

- [ ] **Step 6: Add Lockbox and runtime env plumbing**

Store the production value in Yandex Cloud Lockbox under key `TELEGRAM_ID_HMAC_SECRET`. Generate it locally at setup/deploy time with:

```bash
openssl rand -hex 32
```

Do not commit the generated value to the repository and do not print it in release logs.

Update release/runtime wiring:

- `.github/workflows/release-polling-vm.yml` reads `TELEGRAM_ID_HMAC_SECRET` from Lockbox, masks it, passes it to the migrations container with `-e TELEGRAM_ID_HMAC_SECRET`, and adds it to the API `revision-secrets`.
- `.github/scripts/deploy-yc-polling-vm.sh` reads `TELEGRAM_ID_HMAC_SECRET` from Lockbox and writes it to the root-only bot env file.
- `.github/workflows/release.yml` receives the same key for the legacy manual webhook workflow if that workflow remains usable.
- `docs/deployment-yandex-cloud.md` and `docs/yandex-cloud-github-setup.ru.md` list the new Lockbox key and the `openssl rand -hex 32` generation command.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- test/migrations.run.test.ts test/configuration-service.test.ts
```

Expected: PASS.

---

### Task 2: Telegram Identity Hashing And Repositories

**Files:**
- Create: `src/telegram/telegram-identity.ts`
- Create: `src/scripts/backfill-telegram-identity-hmac.ts`
- Modify: `src/repositories/customer.repository.ts`
- Modify: `src/repositories/operator.repository.ts`
- Modify: `src/bot/handlers/operators.ts`
- Modify: `src/bot/handlers/card-replies.ts`
- Test: `test/telegram-identity.test.ts`
- Create: `test/telegram-identity-backfill.test.ts`
- Test: `test/customer.repository.test.ts`
- Create: `test/operator.repository.test.ts`

- [ ] **Step 1: Write identity hashing tests**

Create tests for:

```ts
hashTelegramUserId(1001, 'secret-secret-secret-secret-secret-1')
```

Expected behavior:

- returns the same hex string for the same user id and secret;
- returns different strings for different user ids;
- returns different strings for different secrets;
- does not include `1001` in the output.

Run: `npm test -- test/telegram-identity.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 2: Implement HMAC helper**

Create `src/telegram/telegram-identity.ts`:

```ts
import { createHmac } from 'node:crypto';

export function hashTelegramUserId(telegramUserId: number | string, secret: string): string {
  return createHmac('sha256', secret)
    .update(String(telegramUserId), 'utf8')
    .digest('hex');
}
```

- [ ] **Step 3: Write backfill tests**

Add tests proving the backfill command:

- requires `TELEGRAM_ID_HMAC_SECRET`;
- fills `customer_identities.telegram_user_id_hmac` from existing `provider_user_id`;
- fills `operators.telegram_user_id_hmac` from existing `telegram_id`;
- is idempotent when run twice;
- never logs raw Telegram ids or the secret.

Run: `npm test -- test/telegram-identity.test.ts test/telegram-identity-backfill.test.ts test/customer.repository.test.ts test/operator.repository.test.ts`

Expected: FAIL until the helper/backfill behavior exists.

- [ ] **Step 4: Implement backfill command**

Create `src/scripts/backfill-telegram-identity-hmac.ts`. It must:

1. load configuration through `ConfigurationService`;
2. compute HMAC values with `hashTelegramUserId`;
3. update only rows where `telegram_user_id_hmac IS NULL`;
4. run inside a database transaction;
5. report counts only, without printing raw ids or secret values.

The release workflow should run it after SQL migrations and before deploying runtime containers:

```bash
node --experimental-strip-types src/scripts/backfill-telegram-identity-hmac.ts
```

- [ ] **Step 5: Write repository tests for HMAC lookup and consent state**

Update customer repository tests to prove:

- resolving an identity uses `telegram_user_id_hmac`;
- repeated resolution returns the same customer;
- consent can be recorded;
- consent can be revoked;
- revoked identity does not count as consented for personal-card operations.

Update operator repository tests to prove active operators are found by HMAC, not raw Telegram id.

- [ ] **Step 6: Update repositories and bot adapters**

Change repository APIs so bot handlers pass either an already-computed HMAC or a dependency that computes it at the adapter boundary.

Target adapter flow:

```ts
const telegramUserIdHash = hashTelegramUserId(ctx.from.id, config.identityHmacSecret);
const customer = await resolveOrCreateIdentity({
  provider: 'telegram',
  telegramUserIdHash,
});
```

For new writes, do not persist `ctx.from.id`, `username`, or display name unless a later product decision requires it. Existing raw rows stay only for the migration transition and are removed by a later cleanup migration after verification.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- test/telegram-identity.test.ts test/telegram-identity-backfill.test.ts test/customer.repository.test.ts test/operator.repository.test.ts
```

Expected: PASS.

---

### Task 3: Consent Gate In Personal-Card Bot Flows

**Files:**
- Modify: `src/copy.ts`
- Modify: `src/bot/handlers/card-replies.ts`
- Modify: `src/bot/handlers/menu-handlers.ts`
- Modify: `src/bot/handlers/commands/create-my-card.ts`
- Modify: `src/bot/handlers/commands/link.ts`
- Modify: `src/bot/handlers/commands/accept-transfer.ts`
- Modify: `src/bot/context.ts`
- Test: `test/bot.personal-data-consent.test.ts`
- Test: `test/bot.owned-card-actions.test.ts`

- [ ] **Step 1: Write bot tests for consent prompt**

Add tests proving:

- `/create_my_card` without existing consent replies with an explicit consent prompt and does not create a card;
- `/link <код>` without existing consent replies with the same prompt and does not link a card;
- reply-keyboard link flow asks for consent before QR/manual link starts;
- `/accept_transfer <код>` asks for consent before accepting the transfer;
- refusal leaves the user without a linked card.

Run: `npm test -- test/bot.personal-data-consent.test.ts`

Expected: FAIL because consent is not implemented.

- [ ] **Step 2: Add user-facing copy**

Add Russian copy under `userCopy.bot.personalDataConsent`:

```ts
prompt: [
  'Для привязки карты бот хранит и обрабатывает данные вашего Telegram-аккаунта.',
  'Это нужно, чтобы связать карту с аккаунтом, показывать вашу карту, баланс, QR и приватную историю операций.',
  'Если вы не согласны, личную карту в Telegram создать или привязать нельзя.',
  'Если согласие уже было дано, отказаться от дальнейшего хранения и обработки можно через отвязку карты.',
].join('\n\n'),
acceptButton: '✅ Согласен',
declineButton: '❌ Не согласен',
accepted: '✅ Согласие сохранено. Продолжаю действие.',
declined: 'Без согласия карта не будет привязана к Telegram-аккаунту.',
```

If notification contact storage is implemented in the same release, add a sentence about service messages before shipping.

- [ ] **Step 3: Add pending consent action to session**

Extend bot session state so the bot can remember which operation is waiting for consent:

```ts
pendingConsentAction:
  | { action: 'createPersonalCard' }
  | { action: 'linkCard'; code?: string }
  | { action: 'acceptTransfer'; token: string }
  | undefined;
```

- [ ] **Step 4: Implement consent helper**

Add a helper at the bot adapter layer:

```ts
async function requirePersonalDataConsent(ctx: MyContext, action: PendingConsentAction): Promise<boolean> {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return false;
  const consent = await customerRepository.findActiveConsent(customer.id, 'telegram');
  if (consent) return true;
  ctx.session.pendingConsentAction = action;
  await ctx.reply(userCopy.bot.personalDataConsent.prompt, {
    reply_markup: {
      keyboard: [[
        { text: userCopy.bot.personalDataConsent.acceptButton },
        { text: userCopy.bot.personalDataConsent.declineButton },
      ]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
  return false;
}
```

Keep exact implementation aligned with existing grammY keyboard patterns.

- [ ] **Step 5: Handle accept/decline buttons**

When the user accepts:

- record `personal_data_consent_at`;
- clear `personal_data_consent_revoked_at`;
- resume the pending action.

When the user declines:

- clear pending action;
- do not create/link/accept a card;
- reply with `userCopy.bot.personalDataConsent.declined`;
- return the normal customer keyboard.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- test/bot.personal-data-consent.test.ts test/bot.owned-card-actions.test.ts
```

Expected: PASS.

---

### Task 4: Unlink Confirmation, Consent Withdrawal, And History Deletion

**Files:**
- Modify: `src/copy.ts`
- Modify: `src/application/card-ownership.use-cases.ts`
- Modify: `src/repositories/transaction.repository.ts`
- Modify: `src/repositories/transaction-receipt.repository.ts`
- Modify: `src/repositories/customer.repository.ts`
- Modify: `src/bot/handlers/card-replies.ts`
- Modify: `src/bot/handlers/commands/unlink.ts`
- Modify: `src/bot/handlers/menu-handlers.ts`
- Modify: `src/bot/context.ts`
- Test: `test/card-ownership.use-cases.test.ts`
- Create: `test/transaction.repository.test.ts`
- Test: `test/bot.unlink-privacy.test.ts`

- [ ] **Step 1: Write application tests for destructive unlink**

Add tests proving `unlinkCard` / `unlinkCurrentCard`:

- delete the current owner row;
- create an `OWNER_UNLINK` transfer event;
- delete all `transaction_receipts` for the card's transactions;
- delete all `transactions` for the card;
- revoke personal-data consent for the customer identity when no other active linked card remains.

Run: `npm test -- test/card-ownership.use-cases.test.ts`

Expected: FAIL because unlink currently does not delete history or revoke consent.

- [ ] **Step 2: Write bot tests for explicit unlink confirmation**

Add tests proving:

- `/unlink` replies with a confirmation before changing data;
- confirmation text says card transaction history will be deleted;
- confirmation text says unlinking is the way to refuse further storage/processing for this card binding;
- cancelling keeps ownership and history intact;
- confirming performs unlink and returns QR/code/balance.

Run: `npm test -- test/bot.unlink-privacy.test.ts`

Expected: FAIL because unlink currently executes immediately.

- [ ] **Step 3: Add repository cleanup methods**

Add methods:

```ts
TransactionReceiptRepository.deleteByTransactionIds(transactionIds: string[], trx?: Knex.Transaction): Promise<void>
TransactionRepository.deleteByCardId(cardId: string, trx?: Knex.Transaction): Promise<void>
CustomerRepository.revokeConsent(customerId: string, provider: 'telegram', trx?: Knex.Transaction): Promise<void>
```

Use the existing transaction boundary in `CardOwnershipUseCases`.

- [ ] **Step 4: Update unlink use case**

Inside the same database transaction:

1. lock card owner row;
2. fetch transaction ids for the card;
3. delete receipts for those transaction ids;
4. delete transactions for the card;
5. delete owner row;
6. create `OWNER_UNLINK` event;
7. revoke consent / deactivate contact data if the customer has no remaining active linked cards.

Return the card so the bot can still show QR/code/balance after cleanup.

- [ ] **Step 5: Add unlink confirmation copy**

Add Russian copy under `userCopy.bot.unlinkPrivacy`:

```ts
confirm: [
  'Вы отвязываете карту от этого Telegram-аккаунта.',
  'Это будет считаться отказом от дальнейшего хранения и обработки персональных данных для этой привязки.',
  'История операций по этой карте будет удалена и не сможет быть восстановлена в боте.',
  'После отвязки бот покажет QR, код и баланс карты. Сохраните их, если хотите пользоваться картой как картой предъявителя.',
].join('\n\n'),
confirmButton: '✅ Отвязать и удалить историю',
cancelButton: 'Отмена',
cancelled: 'Отвязка отменена. Карта осталась привязанной.',
```

- [ ] **Step 6: Add pending unlink state**

Extend session state:

```ts
pendingUnlinkConfirmation:
  | { code?: string }
  | undefined;
```

`/unlink` and the reply-keyboard unlink action should set this state and show confirmation. Only the confirm button calls the unlink use case.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- test/card-ownership.use-cases.test.ts test/transaction.repository.test.ts test/bot.unlink-privacy.test.ts
```

Expected: PASS.

---

### Task 5: Documentation And User Visibility

**Files:**
- Modify: `docs/telegram-bot-ru.md`
- Modify: `docs/terms-of-use-ru.md`
- Modify: `docs/access-control-ru.md`
- Modify: `README.md`
- Test: manual review

- [ ] **Step 1: Update bot documentation**

Document in `docs/telegram-bot-ru.md`:

- personal-card features require explicit personal-data consent;
- `/link`, `/create_my_card`, `/accept_transfer` ask for consent before binding;
- refusal blocks only personal-card binding, not public balance by code;
- `/unlink` is the visible way to withdraw consent for an existing card binding;
- `/unlink` deletes card transaction history and then returns QR/code/balance.

- [ ] **Step 2: Update terms**

Document in `docs/terms-of-use-ru.md`:

- what Telegram account data is stored/processed for card binding;
- what features need this data;
- what the user loses when refusing consent;
- what exactly happens on unlink.

- [ ] **Step 3: Update access-control docs**

Document that Telegram identifiers are adapter-specific inputs and must be converted to internal actor identities through HMAC lookup before application authorization.

- [ ] **Step 4: Decide card/manual asset update scope**

Do not update Figma/PNG Telegram manual cards in this implementation plan unless the product owner explicitly adds that scope. If added, use the `telegram-bot-doc-cards` skill and Figma-first workflow.

- [ ] **Step 5: Review docs**

Manually verify the docs state all user-visible consequences:

- consent is required before personal-card binding;
- refusal prevents personal-card binding;
- later refusal is done by unlinking the card;
- unlinking deletes card transaction history;
- unlinking returns QR/code/balance for bearer-style access.

---

### Task 6: Full Verification And Release Notes

**Files:**
- Modify: release notes or PR description

- [ ] **Step 1: Run full typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Review data migration risk**

Before deploying, document migration handling for existing rows:

- `TELEGRAM_ID_HMAC_SECRET` must exist in Yandex Cloud Lockbox before the release starts;
- the generated value is random, for example from `openssl rand -hex 32`, and must not be committed or printed;
- SQL migration `005_telegram_personal_data_consent.sql` adds transition columns and keeps raw columns;
- release workflow runs `src/scripts/backfill-telegram-identity-hmac.ts` with `TELEGRAM_ID_HMAC_SECRET` from env after SQL migrations;
- existing raw `provider_user_id` values are converted to `telegram_user_id_hmac` by the backfill command;
- existing `operators.telegram_id` values are converted to `telegram_user_id_hmac` by the backfill command;
- a later cleanup migration may add `NOT NULL` constraints and drop raw Telegram identifier columns only after conversion and verification;
- backups containing raw identifiers remain personal-data artifacts and need their own retention decision.

- [ ] **Step 4: Prepare release note**

Mention user-visible changes:

- the bot asks for personal-data consent before card binding;
- refusing consent leaves public code/QR balance flows available;
- unlinking a card withdraws consent for the card binding and deletes transaction history;
- users must save the QR/code shown after unlinking if they want bearer-style access.
