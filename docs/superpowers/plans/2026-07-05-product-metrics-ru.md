# Product Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Построить дешевые продуктовые метрики через PostgreSQL analytics views и Yandex DataLens без ClickHouse, Data Transfer и отдельной аналитической БД.

**Architecture:** Production PostgreSQL остается единственным источником продуктовой аналитики. Приложение добавляет read-only слой `analytics` с SQL views, DataLens подключается только к этим views через отдельного пользователя. Тяжелые materialized views и реплики откладываются до появления измеримой нагрузки.

**Tech Stack:** PostgreSQL, Knex SQL migrations, Node.js test runner, Yandex DataLens.

---

## File Structure

- Create: `src/db/migrations/006_product_analytics_views.sql`
  - Создает схему `analytics`, продуктовые views и комментарии.
- Modify: `test/migrations.run.test.ts`
  - Проверяет, что все миграции, включая новую, применяются на тестовой БД.
- Create: `test/product-analytics-views.test.ts`
  - Наполняет БД минимальными картами, владельцами, переводами, транзакциями и чеками, затем проверяет значения analytics views.
- Modify: `docs/architecture-ru.md`
  - Фиксирует, что продуктовая аналитика живет в PostgreSQL views и читается DataLens.
- Modify: `docs/deployment-yandex-cloud.md`
  - Добавляет операционные шаги: read-only пользователь, DataLens connection, кеш и ограничение рабочих мест.

## Metrics Scope

Минимальный набор для первого релиза:

- `analytics.product_current_snapshot`
  - `cards_total`
  - `active_cards_total`
  - `bound_cards_total`
  - `unbound_cards_total`
  - `bound_cards_ratio`
  - `customers_total`
  - `customers_with_cards_total`
  - `total_initial_amount`
  - `total_balance`
  - `unused_balance`
- `analytics.product_daily_metrics`
  - `date`
  - `cards_created`
  - `cards_bound`
  - `cards_unbound`
  - `transfers_created`
  - `transfers_accepted`
  - `transactions_total`
  - `create_transactions`
  - `debit_transactions`
  - `credit_transactions`
  - `create_amount`
  - `debit_amount`
  - `credit_amount`
  - `active_cards`
  - `active_customers`
- `analytics.receipt_daily_metrics`
  - `date`
  - `receipts_total`
  - `receipts_verified`
  - `receipts_pending`
  - `receipts_failed`
  - `receipts_skipped`
  - `receipt_verification_rate`
- `analytics.operator_daily_metrics`
  - `date`
  - `operator_id`
  - `operator_name`
  - `transactions_total`
  - `debit_transactions`
  - `credit_transactions`
  - `amount_processed`
  - `receipts_skipped`

## Task 1: Create Analytics SQL Views

**Files:**
- Create: `src/db/migrations/006_product_analytics_views.sql`

- [ ] **Step 1: Add the migration file**

Create `src/db/migrations/006_product_analytics_views.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE OR REPLACE VIEW analytics.product_current_snapshot AS
SELECT
    COUNT(c.id)::INTEGER AS cards_total,
    COUNT(c.id) FILTER (WHERE c.is_active)::INTEGER AS active_cards_total,
    COUNT(co.card_id)::INTEGER AS bound_cards_total,
    (COUNT(c.id) - COUNT(co.card_id))::INTEGER AS unbound_cards_total,
    CASE
        WHEN COUNT(c.id) = 0 THEN 0::NUMERIC
        ELSE ROUND(COUNT(co.card_id)::NUMERIC / COUNT(c.id)::NUMERIC, 4)
    END AS bound_cards_ratio,
    (SELECT COUNT(*)::INTEGER FROM customers) AS customers_total,
    (SELECT COUNT(DISTINCT customer_id)::INTEGER FROM card_owners) AS customers_with_cards_total,
    COALESCE(SUM(c.initial_amount), 0)::NUMERIC(12, 2) AS total_initial_amount,
    COALESCE(SUM(c.balance), 0)::NUMERIC(12, 2) AS total_balance,
    COALESCE(SUM(c.balance) FILTER (WHERE c.is_active), 0)::NUMERIC(12, 2) AS unused_balance
FROM cards c
LEFT JOIN card_owners co ON co.card_id = c.id;

CREATE OR REPLACE VIEW analytics.product_daily_metrics AS
WITH days AS (
    SELECT created_at::DATE AS date FROM cards
    UNION
    SELECT linked_at::DATE AS date FROM card_owners
    UNION
    SELECT created_at::DATE AS date FROM card_owner_transfers
    UNION
    SELECT created_at::DATE AS date FROM card_transfer_tokens
    UNION
    SELECT created_at::DATE AS date FROM transactions
),
card_stats AS (
    SELECT
        created_at::DATE AS date,
        COUNT(*)::INTEGER AS cards_created
    FROM cards
    GROUP BY created_at::DATE
),
owner_stats AS (
    SELECT
        linked_at::DATE AS date,
        COUNT(*)::INTEGER AS cards_bound
    FROM card_owners
    GROUP BY linked_at::DATE
),
transfer_stats AS (
    SELECT
        created_at::DATE AS date,
        COUNT(*) FILTER (WHERE type = 'OWNER_UNLINK')::INTEGER AS cards_unbound,
        COUNT(*) FILTER (WHERE type = 'OWNER_TRANSFER')::INTEGER AS transfers_accepted
    FROM card_owner_transfers
    GROUP BY created_at::DATE
),
token_stats AS (
    SELECT
        created_at::DATE AS date,
        COUNT(*)::INTEGER AS transfers_created
    FROM card_transfer_tokens
    GROUP BY created_at::DATE
),
transaction_stats AS (
    SELECT
        t.created_at::DATE AS date,
        COUNT(*)::INTEGER AS transactions_total,
        COUNT(*) FILTER (WHERE t.type = 'CREATE')::INTEGER AS create_transactions,
        COUNT(*) FILTER (WHERE t.type = 'DEBIT')::INTEGER AS debit_transactions,
        COUNT(*) FILTER (WHERE t.type = 'CREDIT')::INTEGER AS credit_transactions,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'CREATE'), 0)::NUMERIC(12, 2) AS create_amount,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'DEBIT'), 0)::NUMERIC(12, 2) AS debit_amount,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'CREDIT'), 0)::NUMERIC(12, 2) AS credit_amount,
        COUNT(DISTINCT t.card_id)::INTEGER AS active_cards,
        COUNT(DISTINCT co.customer_id)::INTEGER AS active_customers
    FROM transactions t
    LEFT JOIN card_owners co ON co.card_id = t.card_id
    GROUP BY t.created_at::DATE
)
SELECT
    d.date,
    COALESCE(cs.cards_created, 0) AS cards_created,
    COALESCE(os.cards_bound, 0) AS cards_bound,
    COALESCE(ts.cards_unbound, 0) AS cards_unbound,
    COALESCE(tks.transfers_created, 0) AS transfers_created,
    COALESCE(ts.transfers_accepted, 0) AS transfers_accepted,
    COALESCE(trs.transactions_total, 0) AS transactions_total,
    COALESCE(trs.create_transactions, 0) AS create_transactions,
    COALESCE(trs.debit_transactions, 0) AS debit_transactions,
    COALESCE(trs.credit_transactions, 0) AS credit_transactions,
    COALESCE(trs.create_amount, 0)::NUMERIC(12, 2) AS create_amount,
    COALESCE(trs.debit_amount, 0)::NUMERIC(12, 2) AS debit_amount,
    COALESCE(trs.credit_amount, 0)::NUMERIC(12, 2) AS credit_amount,
    COALESCE(trs.active_cards, 0) AS active_cards,
    COALESCE(trs.active_customers, 0) AS active_customers
FROM days d
LEFT JOIN card_stats cs ON cs.date = d.date
LEFT JOIN owner_stats os ON os.date = d.date
LEFT JOIN transfer_stats ts ON ts.date = d.date
LEFT JOIN token_stats tks ON tks.date = d.date
LEFT JOIN transaction_stats trs ON trs.date = d.date;

CREATE OR REPLACE VIEW analytics.receipt_daily_metrics AS
SELECT
    tr.created_at::DATE AS date,
    COUNT(*)::INTEGER AS receipts_total,
    COUNT(*) FILTER (WHERE tr.verification_status = 'verified')::INTEGER AS receipts_verified,
    COUNT(*) FILTER (WHERE tr.verification_status = 'pending_verification')::INTEGER AS receipts_pending,
    COUNT(*) FILTER (WHERE tr.verification_status = 'failed')::INTEGER AS receipts_failed,
    COUNT(*) FILTER (WHERE tr.verification_status = 'skipped')::INTEGER AS receipts_skipped,
    CASE
        WHEN COUNT(*) = 0 THEN 0::NUMERIC
        ELSE ROUND(COUNT(*) FILTER (WHERE tr.verification_status = 'verified')::NUMERIC / COUNT(*)::NUMERIC, 4)
    END AS receipt_verification_rate
FROM transaction_receipts tr
GROUP BY tr.created_at::DATE;

CREATE OR REPLACE VIEW analytics.operator_daily_metrics AS
SELECT
    t.created_at::DATE AS date,
    o.id AS operator_id,
    o.name AS operator_name,
    COUNT(t.id)::INTEGER AS transactions_total,
    COUNT(t.id) FILTER (WHERE t.type = 'DEBIT')::INTEGER AS debit_transactions,
    COUNT(t.id) FILTER (WHERE t.type = 'CREDIT')::INTEGER AS credit_transactions,
    COALESCE(SUM(t.amount) FILTER (WHERE t.type IN ('DEBIT', 'CREDIT')), 0)::NUMERIC(12, 2) AS amount_processed,
    COUNT(tr.id) FILTER (WHERE tr.verification_status = 'skipped')::INTEGER AS receipts_skipped
FROM transactions t
LEFT JOIN operators o ON o.id = t.operator_id
LEFT JOIN transaction_receipts tr ON tr.transaction_id = t.id
WHERE t.operator_id IS NOT NULL
GROUP BY t.created_at::DATE, o.id, o.name;

COMMENT ON SCHEMA analytics IS 'Read-only analytics surface for product dashboards.';
COMMENT ON VIEW analytics.product_current_snapshot IS 'Current product counters for DataLens KPI widgets.';
COMMENT ON VIEW analytics.product_daily_metrics IS 'Daily product activity metrics for cards, ownership and transactions.';
COMMENT ON VIEW analytics.receipt_daily_metrics IS 'Daily receipt verification metrics.';
COMMENT ON VIEW analytics.operator_daily_metrics IS 'Daily operator activity metrics.';
```

- [ ] **Step 2: Run migrations test and confirm SQL validity**

Run:

```bash
npm test -- test/migrations.run.test.ts
```

Expected: PASS if migration SQL is valid. This project already has migration-run coverage, so this validates baseline SQL before adding analytics-specific assertions.

- [ ] **Step 3: Commit migration**

```bash
git add src/db/migrations/006_product_analytics_views.sql
git commit -m "Add product analytics views"
```

## Task 2: Add Product Analytics View Tests

**Files:**
- Create: `test/product-analytics-views.test.ts`

- [ ] **Step 1: Write tests for current snapshot and daily metrics**

Create `test/product-analytics-views.test.ts`:

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { db } from '../src/db/knex.ts';
import { closeDatabase, resetDatabase } from './helpers/db.ts';

const runDbTests = process.env.RUN_DB_TESTS === '1';

test.beforeEach({ skip: !runDbTests }, async () => {
  await resetDatabase();
});

test.after({ skip: !runDbTests }, async () => {
  await closeDatabase();
});

test('analytics views expose product metrics without raw personal identifiers', { skip: !runDbTests }, async () => {
  const operatorId = randomUUID();
  const customerId = randomUUID();
  const cardId = randomUUID();
  const transactionId = randomUUID();

  await db('operators').insert({
    id: operatorId,
    telegram_id: 10001,
    name: 'Operator One',
    is_active: true,
  });

  await db('customers').insert({ id: customerId });

  await db('customer_identities').insert({
    customer_id: customerId,
    provider: 'telegram',
    provider_user_id: 'user-1',
    username: 'hidden_username',
    display_name: 'Hidden User',
  });

  await db('cards').insert({
    id: cardId,
    code: 'ANALYTICS-1',
    balance: 700,
    initial_amount: 1000,
    is_active: true,
  });

  await db('card_owners').insert({
    card_id: cardId,
    customer_id: customerId,
  });

  await db('card_owner_transfers').insert({
    card_id: cardId,
    from_customer_id: null,
    to_customer_id: customerId,
    initiated_by_customer_id: customerId,
    type: 'INITIAL_LINK',
  });

  await db('transactions').insert({
    id: transactionId,
    card_id: cardId,
    type: 'DEBIT',
    amount: 300,
    balance_after: 700,
    description: 'Test debit',
    operator_id: operatorId,
  });

  await db('transaction_receipts').insert({
    transaction_id: transactionId,
    verification_status: 'verified',
    created_by_operator_id: operatorId,
  });

  const snapshot = await db('analytics.product_current_snapshot').first();
  assert.equal(Number(snapshot.cards_total), 1);
  assert.equal(Number(snapshot.active_cards_total), 1);
  assert.equal(Number(snapshot.bound_cards_total), 1);
  assert.equal(Number(snapshot.unbound_cards_total), 0);
  assert.equal(Number(snapshot.customers_total), 1);
  assert.equal(Number(snapshot.customers_with_cards_total), 1);
  assert.equal(Number(snapshot.total_initial_amount), 1000);
  assert.equal(Number(snapshot.total_balance), 700);

  const daily = await db('analytics.product_daily_metrics').first();
  assert.equal(Number(daily.cards_created), 1);
  assert.equal(Number(daily.cards_bound), 1);
  assert.equal(Number(daily.transactions_total), 1);
  assert.equal(Number(daily.debit_transactions), 1);
  assert.equal(Number(daily.debit_amount), 300);
  assert.equal(Number(daily.active_cards), 1);
  assert.equal(Number(daily.active_customers), 1);

  const receiptDaily = await db('analytics.receipt_daily_metrics').first();
  assert.equal(Number(receiptDaily.receipts_total), 1);
  assert.equal(Number(receiptDaily.receipts_verified), 1);
  assert.equal(Number(receiptDaily.receipt_verification_rate), 1);

  const operatorDaily = await db('analytics.operator_daily_metrics').first();
  assert.equal(operatorDaily.operator_name, 'Operator One');
  assert.equal(Number(operatorDaily.transactions_total), 1);
  assert.equal(Number(operatorDaily.debit_transactions), 1);
  assert.equal(Number(operatorDaily.amount_processed), 300);

  const snapshotColumns = Object.keys(snapshot);
  assert.equal(snapshotColumns.includes('telegram_id'), false);
  assert.equal(snapshotColumns.includes('provider_user_id'), false);
  assert.equal(snapshotColumns.includes('username'), false);
});
```

- [ ] **Step 2: Run the new test**

Run:

```bash
npm test -- test/product-analytics-views.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit tests**

```bash
git add test/product-analytics-views.test.ts
git commit -m "Test product analytics views"
```

## Task 3: Document DataLens Setup

**Files:**
- Modify: `docs/architecture-ru.md`
- Modify: `docs/deployment-yandex-cloud.md`

- [ ] **Step 1: Update architecture docs**

Append to `docs/architecture-ru.md`:

~~~md
## Продуктовая аналитика

Продуктовые метрики публикуются из PostgreSQL через read-only схему `analytics`. DataLens должен подключаться только к views внутри этой схемы и не должен иметь прямой доступ к таблицам `cards`, `transactions`, `customers`, `customer_identities` и другим transactional таблицам.

Первый релиз аналитики намеренно не использует ClickHouse, Data Transfer и отдельную read replica. Это сохраняет минимальную стоимость владения. Если DataLens начнет заметно нагружать production PostgreSQL, тяжелые views переводятся в materialized views с обновлением по расписанию, а затем рассматривается read replica или ClickHouse.
~~~

- [ ] **Step 2: Update deployment docs**

Append to `docs/deployment-yandex-cloud.md`:

~~~md
## DataLens для продуктовых метрик

Минимальная дешевая схема:

1. Применить миграции, чтобы появилась схема `analytics`.
2. Создать read-only пользователя PostgreSQL:

```sql
CREATE USER datalens_reader WITH PASSWORD '<strong-password>';
GRANT USAGE ON SCHEMA analytics TO datalens_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO datalens_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT ON TABLES TO datalens_reader;
```

3. В DataLens создать PostgreSQL connection к managed PostgreSQL.
4. Подключать только views из схемы `analytics`.
5. Установить cache TTL не меньше 900 секунд для обычных dashboard-ов. Для дешевой эксплуатации лучше 1800-3600 секунд, если не нужен near real-time.
6. Оставить один рабочий аккаунт DataLens и отключить автоматическую покупку рабочих мест.

DataLens не должен использовать пользователя приложения или администратора БД.
~~~

- [ ] **Step 3: Run docs sanity check**

Run:

```bash
npm test -- test/migrations.run.test.ts test/product-analytics-views.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit docs**

```bash
git add docs/architecture-ru.md docs/deployment-yandex-cloud.md
git commit -m "Document product analytics setup"
```

## Task 4: Configure DataLens Dashboard Manually

**Files:**
- No repository files.

- [ ] **Step 1: Create DataLens connection**

In DataLens:

1. Create PostgreSQL connection.
2. Select the managed PostgreSQL cluster.
3. Use `datalens_reader`.
4. Set cache TTL to `1800` seconds.
5. Verify connection.

- [ ] **Step 2: Create datasets**

Create datasets:

```text
product_current_snapshot -> analytics.product_current_snapshot
product_daily_metrics -> analytics.product_daily_metrics
receipt_daily_metrics -> analytics.receipt_daily_metrics
operator_daily_metrics -> analytics.operator_daily_metrics
```

- [ ] **Step 3: Create dashboard widgets**

Create KPI widgets:

```text
Всего карт
Привязано карт
% привязки
Остаток на активных картах
Транзакций сегодня
Сумма списаний сегодня
```

Create charts:

```text
Созданные карты по дням
Привязки карт по дням
Списания и пополнения по дням
Статусы чеков по дням
Активность операторов по дням
```

- [ ] **Step 4: Verify cost controls**

Confirm:

```text
Only one DataLens workplace is assigned.
Automatic workplace purchase is disabled.
No ClickHouse cluster exists for this analytics plan.
No Data Transfer endpoint exists for this analytics plan.
```

## Verification

- [ ] `npm test -- test/migrations.run.test.ts`
- [ ] `npm test -- test/product-analytics-views.test.ts`
- [ ] `npm test`
- [ ] DataLens connection uses `datalens_reader`, not the application DB user.
- [ ] DataLens dashboard contains no Telegram user identifiers, card codes or raw transaction IDs.
