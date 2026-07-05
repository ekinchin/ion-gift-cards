# Environments and Feature Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить локальное Docker-based test окружение, Yandex Cloud preprod окружение и production feature toggles, чтобы проверять изменения до включения на всех пользователей.

**Architecture:** Test - полностью локальное окружение: Docker Compose поднимает PostgreSQL и app services, секреты берутся из локального `.env.test`, Lockbox не используется. Preprod - окружение в Yandex Cloud с отдельными runtime ресурсами и отдельной PostgreSQL database внутри того же Managed PostgreSQL cluster, если дополнительная database в существующем cluster не тарифицируется отдельно; production использует `ion_gift_card`, preprod использует `ion_gift_card_preprod`. `DB_SCHEMA` и `search_path` остаются для локального test и временных локальных schemas. Feature toggles хранятся в PostgreSQL, по умолчанию считаются выключенными при отсутствии строки в БД и проверяются на границах Telegram/API adapter-ов и application layer с поддержкой allowlist по Telegram identity HMAC.

**Tech Stack:** Node.js 24, TypeScript, Docker Compose, PostgreSQL schemas, Knex, SQL migrations, GitHub Actions, Yandex Cloud Lockbox, Telegram bot.

---

## File Structure

- Modify: `src/configuration/configuration-service.ts`
  - Добавляет `DB_SCHEMA` и `APP_ENV`.
- Modify: `knexfile.ts`
  - Передает PostgreSQL `search_path` через Knex config.
- Modify: `test/configuration-service.test.ts`
  - Проверяет defaults и validation для schema/environment.
- Modify: `test/knexfile.test.ts`
  - Проверяет, что Knex получает `searchPath`.
- Modify: `src/db/migrations/run.ts`
  - Создает выбранную схему до создания `schema_migrations`.
- Modify: `test/migrations.run.test.ts`
  - Проверяет schema bootstrap перед миграциями.
- Create: `src/db/migrations/006_feature_flags.sql`
  - Добавляет таблицу `feature_flags` в текущую application schema.
- Create: `src/application/feature-flags.ts`
  - Описывает feature keys, audience values, actor input и evaluator.
- Create: `src/repositories/feature-flag.repository.ts`
  - Читает flags из PostgreSQL.
- Create: `src/application/feature-flag.service.ts`
  - Читает DB feature flag records и применяет evaluator; отсутствие строки означает `off`.
- Create: `test/feature-flags.test.ts`
  - Unit-тестирует правила audience без реальной БД.
- Create: `test/feature-flag.repository.test.ts`
  - Integration-тестирует хранение flags и JSON allowlist.
- Modify: `src/services/index.ts`
  - Экспортирует общий feature flag repository/service.
- Modify: `src/bot/handlers/commands/transfer.ts`
- Modify: `src/bot/handlers/commands/accept-transfer.ts`
  - Закрывает первую production-фичу feature flag-ом. Начать с низкорискового существующего flow: transfer commands.
- Modify: `.env.example`
  - Документирует `DB_SCHEMA` и `APP_ENV`.
- Create: `.env.test.example`
  - Документирует локальный test bot token и локальные PostgreSQL настройки. В файле не должно быть реальных секретов.
- Modify: `docker-compose.yml`
  - Передает `DB_SCHEMA=public` для локального default.
- Create: `docker-compose.test.yml`
  - Добавляет local test override с `APP_ENV=test`, `DB_SCHEMA=test`, отдельным PostgreSQL port и отдельным test volume.
- Modify: `.github/workflows/release-polling-vm.yml`
  - Добавляет `workflow_dispatch` environment input и прокидывает `DB_SCHEMA` из GitHub environment variables.
- Modify: `.github/scripts/deploy-yc-polling-vm.sh`
  - Пишет `DB_SCHEMA` в env file polling bot VM.
- Modify: `docs/deployment-yandex-cloud.md`
  - Документирует локальное test окружение, preprod database, отдельные runtime ресурсы и rollout flags.
- Modify: `docs/architecture-ru.md`
  - Фиксирует schema isolation и границы feature toggles.

## Принятые решения

- Production остается на `DB_SCHEMA=public`.
- Preprod развернут в Yandex Cloud и использует отдельные runtime ресурсы: Telegram bot token, Lockbox secret, API container, bot VM и QR Mini App bucket.
- Preprod делит production PostgreSQL cluster только на уровне cluster и использует отдельную database, `DB_NAME=ion_gift_card_preprod`, с `DB_SCHEMA=public`.
- Если дополнительная PostgreSQL database внутри существующего Managed PostgreSQL cluster начнет тарифицироваться отдельно, fallback - `DB_NAME=ion_gift_card` плюс `DB_SCHEMA=preprod`.
- Test полностью локальный: Docker Compose, локальный `.env.test`, отдельный Telegram test bot token и PostgreSQL в контейнере.
- Test не использует Yandex Lockbox и любые Yandex Cloud runtime resources.
- Test по умолчанию использует `DB_SCHEMA=test`, а при необходимости может использовать временные локальные schemas вроде `test_branch_name`.
- Feature flags поддерживают audiences: `off`, `allowlist`, `operators`, `all`.
- Allowlist хранит Telegram user HMAC values, не raw Telegram user ids.

## Task 1: Add Database Schema Configuration

**Files:**
- Modify: `src/configuration/configuration-service.ts`
- Modify: `test/configuration-service.test.ts`

- [ ] **Step 1: Write failing configuration tests**

Добавить в `test/configuration-service.test.ts`:

```ts
test('configuration service reads database schema and app environment', () => {
  const service = ConfigurationService.fromEnv({
    TELEGRAM_MODE: 'polling',
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_ID_HMAC_SECRET: '12345678901234567890123456789012',
    DB_SCHEMA: 'test',
    APP_ENV: 'test',
  });

  assert.equal(service.getDatabaseConfig().schema, 'test');
  assert.equal(service.getConfig().appEnv, 'test');
});

test('configuration service uses safe environment defaults', () => {
  const service = ConfigurationService.fromEnv({
    TELEGRAM_MODE: 'polling',
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_ID_HMAC_SECRET: '12345678901234567890123456789012',
  });

  assert.equal(service.getDatabaseConfig().schema, 'public');
  assert.equal(service.getConfig().appEnv, 'local');
});

test('configuration service rejects invalid database schema names', () => {
  assert.throws(
    () => ConfigurationService.fromEnv({
      TELEGRAM_MODE: 'polling',
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_ID_HMAC_SECRET: '12345678901234567890123456789012',
      DB_SCHEMA: 'bad-schema',
    }).getDatabaseConfig(),
    /DB_SCHEMA/
  );
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
npm test -- test/configuration-service.test.ts
```

Expected: FAIL, потому что `schema` и `appEnv` еще не добавлены.

- [ ] **Step 3: Implement config fields**

В `src/configuration/configuration-service.ts` добавить schemas:

```ts
const identifierSchema = z.preprocess(
  (value) => value === '' || value === undefined ? 'public' : value,
  z.string().regex(/^[a-z][a-z0-9_]*$/, 'Must be a PostgreSQL identifier: lowercase letters, digits, and underscores')
);
const appEnvSchema = z.preprocess(
  (value) => value === '' || value === undefined ? 'local' : value,
  z.enum(['local', 'test', 'preprod', 'production'])
);
```

Добавить в `configurationSchema`:

```ts
appEnv: appEnvSchema,
database: z.object({
  host: requiredString.default('localhost'),
  port: portSchema.default(5432),
  user: requiredString.default('postgres'),
  password: requiredString.default('postgres'),
  name: requiredString.default('ion_gift_card'),
  schema: identifierSchema,
  ssl: booleanStringSchema,
  pool: z.object({
    min: poolSizeSchema.default(0),
    max: poolSizeSchema.default(2),
  }),
})
```

Добавить env names:

```ts
['appEnv', 'APP_ENV'],
['database.schema', 'DB_SCHEMA'],
```

Добавить `schema: env.DB_SCHEMA` в `buildDatabaseConfig(env)` и `appEnv: env.APP_ENV` в объект, который передается в `parseConfig()` внутри `getConfig()`.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
npm test -- test/configuration-service.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/configuration/configuration-service.ts test/configuration-service.test.ts
git commit -m "Add environment and database schema config"
```

## Task 2: Apply PostgreSQL Search Path in Knex

**Files:**
- Modify: `knexfile.ts`
- Modify: `test/knexfile.test.ts`

- [ ] **Step 1: Write failing Knex test**

Добавить в `test/knexfile.test.ts`:

```ts
test('Knex config sets PostgreSQL search path for schema-isolated environments', () => {
  const config = createKnexConfig({
    host: 'db.internal',
    port: 5432,
    user: 'app',
    password: 'secret',
    name: 'gift_cards',
    schema: 'test',
    ssl: false,
    pool: {
      min: 0,
      max: 2,
    },
  });

  assert.deepEqual(config.searchPath, ['test']);
});
```

В существующие вызовы `createKnexConfig` в этом файле добавить `schema: 'public'`.

- [ ] **Step 2: Run focused test and confirm failure**

Run:

```bash
npm test -- test/knexfile.test.ts
```

Expected: FAIL, потому что `searchPath` еще отсутствует.

- [ ] **Step 3: Implement search path**

В `createKnexConfig()` в `knexfile.ts` добавить:

```ts
return {
  client: 'pg',
  connection,
  searchPath: [databaseConfig.schema],
  pool: {
    ...databaseConfig.pool,
    idleTimeoutMillis: 5000,
    reapIntervalMillis: 1000,
    acquireTimeoutMillis: 10000,
    createTimeoutMillis: 10000,
    destroyTimeoutMillis: 5000,
    createRetryIntervalMillis: 200,
  },
};
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- test/knexfile.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add knexfile.ts test/knexfile.test.ts
git commit -m "Set PostgreSQL search path from DB schema"
```

## Task 3: Bootstrap Migration Schema

**Files:**
- Modify: `src/db/migrations/run.ts`
- Modify: `test/migrations.run.test.ts`

- [ ] **Step 1: Extend fake migration DB test**

В `test/migrations.run.test.ts` изменить первый migration test:

```ts
const result = await migrate({ db: fakeDb, migrationsDir, schema: 'test' });
```

Проверки SQL:

```ts
assert.match(fakeDb.executedSql[0], /CREATE SCHEMA IF NOT EXISTS "test"/);
assert.match(fakeDb.executedSql[1], /CREATE TABLE IF NOT EXISTS schema_migrations/);
```

Заменить `fakeDb.executedSql.slice(1)` на `fakeDb.executedSql.slice(2)`.

- [ ] **Step 2: Run focused test and confirm failure**

Run:

```bash
npm test -- test/migrations.run.test.ts
```

Expected: FAIL, потому что `migrate()` еще не принимает и не создает schema.

- [ ] **Step 3: Implement schema bootstrap**

В `src/db/migrations/run.ts` добавить:

```ts
function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function ensureApplicationSchema(db: MigrationDb, schema: string) {
  await db.raw(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)};`);
}
```

Изменить signature `migrate()`:

```ts
export async function migrate(options: {
  db?: MigrationDb;
  migrationsDir?: string;
  schema?: string;
} = {}): Promise<MigrationResult[]> {
  const migrationDb = options.db ?? new KnexMigrationDb(knexDb);
  const migrationsDir = options.migrationsDir ?? __dirname;
  const schema = options.schema ?? ConfigurationService.fromEnv().getDatabaseConfig().schema;
```

Перед `ensureMigrationHistoryTable(migrationDb)` вызвать:

```ts
await ensureApplicationSchema(migrationDb, schema);
```

Добавить import:

```ts
import { ConfigurationService } from '../../configuration/configuration-service.ts';
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- test/migrations.run.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/run.ts test/migrations.run.test.ts
git commit -m "Bootstrap configured database schema in migrations"
```

## Task 4: Add Feature Flag Schema

**Files:**
- Create: `src/db/migrations/006_feature_flags.sql`
- Modify: `test/migrations.run.test.ts`

- [ ] **Step 1: Add migration ordering test**

Добавить в `test/migrations.run.test.ts`:

```ts
test('feature flags migration follows Telegram personal data consent migration', async () => {
  const migrationsDir = join(import.meta.dirname, '..', 'src', 'db', 'migrations');
  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  assert.equal(
    migrationFiles.indexOf('006_feature_flags.sql'),
    migrationFiles.indexOf('005_telegram_personal_data_consent.sql') + 1
  );

  const sql = readFileSync(join(migrationsDir, '006_feature_flags.sql'), 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS feature_flags/i);
  assert.match(sql, /audience TEXT NOT NULL/i);
  assert.match(sql, /allowlist JSONB NOT NULL/i);
  assert.match(sql, /CHECK \(audience IN \('off', 'allowlist', 'operators', 'all'\)\)/i);
});
```

- [ ] **Step 2: Run focused test and confirm failure**

Run:

```bash
npm test -- test/migrations.run.test.ts
```

Expected: FAIL, потому что `006_feature_flags.sql` еще не существует.

- [ ] **Step 3: Create migration**

Создать `src/db/migrations/006_feature_flags.sql`:

```sql
CREATE TABLE IF NOT EXISTS feature_flags (
    key TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    audience TEXT NOT NULL DEFAULT 'off',
    allowlist JSONB NOT NULL DEFAULT '[]'::JSONB,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT feature_flags_audience_check CHECK (audience IN ('off', 'allowlist', 'operators', 'all')),
    CONSTRAINT feature_flags_allowlist_array_check CHECK (jsonb_typeof(allowlist) = 'array')
);

COMMENT ON TABLE feature_flags IS 'Runtime feature toggles for staged production rollout.';
COMMENT ON COLUMN feature_flags.key IS 'Stable application feature key.';
COMMENT ON COLUMN feature_flags.enabled IS 'Global kill switch for the feature.';
COMMENT ON COLUMN feature_flags.audience IS 'Rollout audience: off, allowlist, operators, or all.';
COMMENT ON COLUMN feature_flags.allowlist IS 'JSON array of allowed Telegram user HMAC values.';
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- test/migrations.run.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/006_feature_flags.sql test/migrations.run.test.ts
git commit -m "Add feature flags schema"
```

## Task 5: Implement Feature Flag Evaluator

**Files:**
- Create: `src/application/feature-flags.ts`
- Create: `test/feature-flags.test.ts`

- [ ] **Step 1: Write evaluator tests**

Создать `test/feature-flags.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateFeatureFlag, type FeatureFlagRecord } from '../src/application/feature-flags.ts';

const baseFlag: FeatureFlagRecord = {
  key: 'card_transfer',
  enabled: true,
  audience: 'off',
  allowlist: [],
};

test('feature flag evaluator denies disabled flags', () => {
  assert.equal(evaluateFeatureFlag({ ...baseFlag, enabled: false, audience: 'all' }, {}), false);
});

test('feature flag evaluator enables all audience for everyone', () => {
  assert.equal(evaluateFeatureFlag({ ...baseFlag, audience: 'all' }, {}), true);
});

test('feature flag evaluator enables operators audience only for operators', () => {
  assert.equal(evaluateFeatureFlag({ ...baseFlag, audience: 'operators' }, { isOperator: true }), true);
  assert.equal(evaluateFeatureFlag({ ...baseFlag, audience: 'operators' }, { isOperator: false }), false);
});

test('feature flag evaluator enables allowlisted Telegram identity HMAC values', () => {
  const flag = { ...baseFlag, audience: 'allowlist' as const, allowlist: ['hmac-1'] };

  assert.equal(evaluateFeatureFlag(flag, { telegramUserIdHmac: 'hmac-1' }), true);
  assert.equal(evaluateFeatureFlag(flag, { telegramUserIdHmac: 'hmac-2' }), false);
});
```

- [ ] **Step 2: Run focused test and confirm failure**

Run:

```bash
npm test -- test/feature-flags.test.ts
```

Expected: FAIL, потому что `src/application/feature-flags.ts` еще не существует.

- [ ] **Step 3: Implement evaluator**

Создать `src/application/feature-flags.ts`:

```ts
export const featureKeys = ['card_transfer'] as const;

export type FeatureKey = typeof featureKeys[number];
export type FeatureAudience = 'off' | 'allowlist' | 'operators' | 'all';

export type FeatureFlagRecord = {
  key: FeatureKey;
  enabled: boolean;
  audience: FeatureAudience;
  allowlist: string[];
};

export type FeatureActor = {
  telegramUserIdHmac?: string;
  isOperator?: boolean;
};

export function evaluateFeatureFlag(flag: FeatureFlagRecord, actor: FeatureActor): boolean {
  if (!flag.enabled || flag.audience === 'off') {
    return false;
  }

  if (flag.audience === 'all') {
    return true;
  }

  if (flag.audience === 'operators') {
    return actor.isOperator === true;
  }

  if (!actor.telegramUserIdHmac) {
    return false;
  }

  return flag.allowlist.includes(actor.telegramUserIdHmac);
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- test/feature-flags.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/feature-flags.ts test/feature-flags.test.ts
git commit -m "Add feature flag evaluator"
```

## Task 6: Add Feature Flag Repository and Service

**Files:**
- Create: `src/repositories/feature-flag.repository.ts`
- Create: `src/application/feature-flag.service.ts`
- Create: `test/feature-flag.repository.test.ts`
- Modify: `src/services/index.ts`

- [ ] **Step 1: Write repository and service tests**

Создать `test/feature-flag.repository.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/db/knex.ts';
import { FeatureFlagService } from '../src/application/feature-flag.service.ts';
import { FeatureFlagRepository } from '../src/repositories/feature-flag.repository.ts';
import { closeDatabase, resetDatabase } from './helpers/db.ts';

const runDbTests = process.env.RUN_DB_TESTS === 'true';

test.beforeEach({ skip: !runDbTests }, async () => {
  await resetDatabase();
  await db('feature_flags').delete();
});

test.after({ skip: !runDbTests }, async () => {
  await closeDatabase();
});

test('feature flag service reads DB override and evaluates allowlist', { skip: !runDbTests }, async () => {
  await db('feature_flags').insert({
    key: 'card_transfer',
    enabled: true,
    audience: 'allowlist',
    allowlist: JSON.stringify(['hmac-1']),
  });

  const service = new FeatureFlagService(new FeatureFlagRepository());

  assert.equal(
    await service.isEnabled('card_transfer', { telegramUserIdHmac: 'hmac-1' }),
    true
  );
  assert.equal(
    await service.isEnabled('card_transfer', { telegramUserIdHmac: 'hmac-2' }),
    false
  );
});
```

- [ ] **Step 2: Run focused test and confirm failure**

Run:

```bash
RUN_DB_TESTS=true npm test -- test/feature-flag.repository.test.ts
```

Expected: FAIL, потому что repository/service еще не существуют.

- [ ] **Step 3: Implement repository**

Создать `src/repositories/feature-flag.repository.ts`:

```ts
import { db } from '../db/knex.ts';
import type { FeatureFlagRecord, FeatureKey } from '../application/feature-flags.ts';

type FeatureFlagRow = {
  key: FeatureKey;
  enabled: boolean;
  audience: FeatureFlagRecord['audience'];
  allowlist: string[] | string;
};

export class FeatureFlagRepository {
  async getByKey(key: FeatureKey): Promise<FeatureFlagRecord | undefined> {
    const row = await db<FeatureFlagRow>('feature_flags')
      .where({ key })
      .first();

    if (!row) {
      return undefined;
    }

    return {
      key: row.key,
      enabled: row.enabled,
      audience: row.audience,
      allowlist: Array.isArray(row.allowlist) ? row.allowlist : JSON.parse(row.allowlist),
    };
  }
}
```

- [ ] **Step 4: Implement service**

Создать `src/application/feature-flag.service.ts`:

```ts
import {
  evaluateFeatureFlag,
  type FeatureActor,
  type FeatureFlagRecord,
  type FeatureKey,
} from './feature-flags.ts';

type FeatureFlagSource = {
  getByKey(key: FeatureKey): Promise<FeatureFlagRecord | undefined>;
};

export class FeatureFlagService {
  constructor(private readonly source: FeatureFlagSource) {}

  async isEnabled(key: FeatureKey, actor: FeatureActor): Promise<boolean> {
    const flag = await this.source.getByKey(key);

    if (!flag) {
      return false;
    }

    return evaluateFeatureFlag(flag, actor);
  }
}
```

В `src/services/index.ts` добавить:

```ts
import { FeatureFlagRepository } from '../repositories/feature-flag.repository.ts';
import { FeatureFlagService } from '../application/feature-flag.service.ts';

export const featureFlagRepository = new FeatureFlagRepository();
export const featureFlagService = new FeatureFlagService(featureFlagRepository);
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- test/feature-flags.test.ts
RUN_DB_TESTS=true npm test -- test/feature-flag.repository.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/application/feature-flag.service.ts src/repositories/feature-flag.repository.ts src/services/index.ts test/feature-flag.repository.test.ts
git commit -m "Add feature flag service"
```

## Task 7: Gate First Production Feature

**Files:**
- Modify: `src/bot/handlers/commands/transfer.ts`
- Modify: `src/bot/handlers/commands/accept-transfer.ts`
- Create: `test/bot.feature-flags.test.ts`

- [ ] **Step 1: Write bot feature flag tests**

Создать `test/bot.feature-flags.test.ts` и тестировать guard. Если handlers сейчас неудобно тестировать напрямую, сначала выделить helper:

```ts
export async function assertCardTransferEnabled(options: {
  featureFlags: Pick<FeatureFlagService, 'isEnabled'>;
  actor: FeatureActor;
}) {
  const enabled = await options.featureFlags.isEnabled('card_transfer', options.actor);

  if (!enabled) {
    throw new ApplicationError(
      'FEATURE_DISABLED',
      'Передача карты временно недоступна.'
    );
  }
}
```

Тесты:

```ts
test('card transfer guard rejects disabled feature', async () => {
  await assert.rejects(
    () => assertCardTransferEnabled({
      featureFlags: { isEnabled: async () => false },
      actor: {},
    }),
    /Передача карты временно недоступна/
  );
});

test('card transfer guard allows enabled feature', async () => {
  await assert.doesNotReject(
    () => assertCardTransferEnabled({
      featureFlags: { isEnabled: async () => true },
      actor: {},
    })
  );
});
```

- [ ] **Step 2: Run focused test and confirm failure**

Run:

```bash
npm test -- test/bot.feature-flags.test.ts
```

Expected: FAIL, потому что guard еще не реализован.

- [ ] **Step 3: Implement guard in transfer flows**

В command paths transfer и accept-transfer вызвать guard до создания или принятия transfer token. Actor собирать из Telegram identity HMAC и результата operator lookup:

```ts
await assertCardTransferEnabled({
  featureFlags: featureFlagService,
  actor: {
    telegramUserIdHmac,
    isOperator: operator !== undefined,
  },
});
```

Happy path при включенном флаге должен остаться прежним.

- [ ] **Step 4: Run focused bot tests**

Run:

```bash
npm test -- test/bot.feature-flags.test.ts test/bot.owned-card-actions.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bot/handlers/commands/transfer.ts src/bot/handlers/commands/accept-transfer.ts test/bot.feature-flags.test.ts
git commit -m "Gate card transfer with feature flag"
```

## Task 8: Wire Test and Preprod Runtime Environment Variables

**Files:**
- Modify: `.env.example`
- Create: `.env.test.example`
- Modify: `docker-compose.yml`
- Create: `docker-compose.test.yml`
- Modify: `.github/workflows/release-polling-vm.yml`
- Modify: `.github/scripts/deploy-yc-polling-vm.sh`

- [ ] **Step 1: Update base local env docs**

В `.env.example` добавить:

```env
APP_ENV=local
DB_SCHEMA=public
```

В `docker-compose.yml` для `migrations`, `api` и `bot` добавить:

```yaml
DB_SCHEMA: ${DB_SCHEMA:-public}
APP_ENV: ${APP_ENV:-local}
```

- [ ] **Step 2: Add local test environment files**

Создать `.env.test.example`:

```env
# Local test environment. Copy to .env.test and put the token of a dedicated Telegram test bot.
APP_ENV=test
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=ion_gift_card_test
DB_SCHEMA=test
DB_POOL_MIN=0
DB_POOL_MAX=2

TELEGRAM_MODE=polling
TELEGRAM_BOT_TOKEN=put_dedicated_test_bot_token_here
TELEGRAM_ID_HMAC_SECRET=local-test-telegram-identity-hmac-secret-32bytes
WEB_APP_URL=

PORT=3000
API_HOST=0.0.0.0
```

Создать `docker-compose.test.yml`:

```yaml
services:
  postgres:
    ports:
      - "5433:5432"
    environment:
      POSTGRES_DB: ion_gift_card_test
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata_test:/var/lib/postgresql/data

  migrations:
    env_file:
      - .env.test
    environment:
      APP_ENV: test
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ion_gift_card_test
      DB_SCHEMA: test

  api:
    env_file:
      - .env.test
    environment:
      APP_ENV: test
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ion_gift_card_test
      DB_SCHEMA: test

  bot:
    env_file:
      - .env.test
    environment:
      APP_ENV: test
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ion_gift_card_test
      DB_SCHEMA: test
      TELEGRAM_MODE: polling

volumes:
  pgdata_test:
```

Локальное test окружение запускается так:

```bash
cp .env.test.example .env.test
docker compose --env-file .env.test -f docker-compose.yml -f docker-compose.test.yml up -d postgres migrations api bot
```

Expected: PostgreSQL доступен локально на host port `5433`, app containers используют `APP_ENV=test`, `DB_SCHEMA=test` и test Telegram bot token из `.env.test`. Yandex Lockbox не читается.

- [ ] **Step 3: Update preprod release workflow**

В `.github/workflows/release-polling-vm.yml` изменить trigger:

```yaml
on:
  push:
    tags:
      - "v*.*.*"
  workflow_dispatch:
    inputs:
      target_environment:
        description: "Deployment environment"
        required: true
        default: "preprod"
        type: choice
        options:
          - preprod
          - production
```

Изменить job environment:

```yaml
environment: ${{ github.event_name == 'workflow_dispatch' && inputs.target_environment || 'production' }}
```

Добавить переменные validation:

```yaml
APP_ENV: ${{ vars.APP_ENV || 'production' }}
DB_SCHEMA: ${{ vars.DB_SCHEMA || 'public' }}
```

Для GitHub environment `preprod` задать:

```text
APP_ENV=preprod
DB_SCHEMA=public
```

Preprod Lockbox secret должен содержать:

```text
DB_NAME=ion_gift_card_preprod
```

Прокинуть обе переменные в migrations и backfill:

```bash
docker run --rm \
  -e APP_ENV \
  -e DB_SCHEMA \
  -e DB_HOST \
  -e DB_PORT \
  -e DB_NAME \
  -e DB_USER \
  -e DB_PASSWORD \
  "$MIGRATIONS_IMAGE" \
  node --experimental-strip-types src/db/migrations/run.ts
```

Добавить обе переменные в API `revision-env`:

```yaml
revision-env: |
  APP_ENV=${{ vars.APP_ENV || 'production' }}
  DB_SCHEMA=${{ vars.DB_SCHEMA || 'public' }}
  API_HOST=0.0.0.0
```

Добавить обе переменные в env шага `Deploy bot polling VM`:

```yaml
APP_ENV: ${{ vars.APP_ENV || 'production' }}
DB_SCHEMA: ${{ vars.DB_SCHEMA || 'public' }}
```

- [ ] **Step 4: Update preprod VM deploy script**

В `.github/scripts/deploy-yc-polling-vm.sh` задать defaults:

```bash
app_env="${APP_ENV:-production}"
db_schema="${DB_SCHEMA:-public}"
```

Записать оба значения в `/etc/ion-gift-card-bot.env`:

```bash
echo "APP_ENV=__APP_ENV__"
echo "DB_SCHEMA=__DB_SCHEMA__"
```

Добавить `replace_placeholder` для `__APP_ENV__` и `__DB_SCHEMA__`.

- [ ] **Step 5: Run static checks**

Run:

```bash
npm run typecheck
npm test -- test/configuration-service.test.ts test/knexfile.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .env.example .env.test.example docker-compose.yml docker-compose.test.yml .github/workflows/release-polling-vm.yml .github/scripts/deploy-yc-polling-vm.sh
git commit -m "Wire test and preprod environment config"
```

## Task 9: Document Test, Preprod, and Feature Rollout

**Files:**
- Modify: `docs/deployment-yandex-cloud.md`
- Modify: `docs/architecture-ru.md`

- [ ] **Step 1: Document deployment model**

В `docs/deployment-yandex-cloud.md` добавить:

````md
## Local Test Environment

Test is a local-only environment. It does not use Yandex Lockbox, Yandex runtime
resources, or the production/preprod Telegram bot token. Create a dedicated Telegram
bot through BotFather and put its token into local `.env.test`.

The local test stack uses Docker Compose and a PostgreSQL container:

```bash
cp .env.test.example .env.test
docker compose --env-file .env.test -f docker-compose.yml -f docker-compose.test.yml up -d postgres migrations api bot
```

Defaults:

```text
APP_ENV=test
DB_NAME=ion_gift_card_test
DB_SCHEMA=test
POSTGRES host port=5433
```

Use this environment for manual Telegram testing and local smoke checks before deploying
to preprod.
````

Добавить preprod section:

````md
## Preprod Environment

Preprod is deployed in Yandex Cloud. It uses separate runtime resources: Lockbox secret,
Telegram bot token, API Serverless Container, polling bot VM, and QR Mini App Object
Storage bucket. It shares the production PostgreSQL cluster only at the cluster level
and uses a separate PostgreSQL database. Production uses `DB_NAME=ion_gift_card`;
preprod uses `DB_NAME=ion_gift_card_preprod`. Both use `DB_SCHEMA=public`.

Before first preprod deploy, create the database in the existing cluster if that does
not add separate billing:

```sql
CREATE DATABASE ion_gift_card_preprod;
```

GitHub environment `preprod` must define the same variables as `production`, but point
to preprod runtime resources and set:

```text
APP_ENV=preprod
DB_SCHEMA=public
```

The preprod Lockbox secret must point to the preprod database:

```text
DB_NAME=ion_gift_card_preprod
```

If an extra database inside the existing Managed PostgreSQL cluster becomes separately
billed, use the fallback model: `DB_NAME=ion_gift_card` and `DB_SCHEMA=preprod`.
````

Добавить rollout instructions:

```md
## Feature Toggle Rollout

Feature flags live in `feature_flags`. Rollout order:

1. `off`
2. `allowlist`
3. `operators`
4. `all`

Allowlist values are Telegram user HMAC values, not raw Telegram ids. Use `off` as the
production kill switch.
```

- [ ] **Step 2: Document architecture**

В `docs/architecture-ru.md` добавить:

```md
## Окружения и feature toggles

Test - локальное окружение: Docker Compose поднимает PostgreSQL в контейнере, приложение
берет секреты из `.env.test`, Telegram работает через отдельный test bot token, Lockbox
и Yandex Cloud runtime ресурсы не используются. Для локальной изоляции test использует
`DB_NAME=ion_gift_card_test` и `DB_SCHEMA=test`.

Preprod - отдельное окружение в Yandex Cloud. Production и preprod используют один
PostgreSQL cluster, но разные databases: production `ion_gift_card`, preprod
`ion_gift_card_preprod`. Это снижает риск ошибки `search_path` между production и
preprod, сохраняя общий cluster. Если отдельная database внутри cluster начнет
тарифицироваться отдельно, fallback - общая database и отдельная schema `preprod`.

Feature toggles применяются на границах адаптеров и application use case-ов. Telegram
rollout не хранит raw Telegram id в allowlist: для таргетинга используется HMAC lookup.
```

- [ ] **Step 3: Commit docs**

```bash
git add docs/deployment-yandex-cloud.md docs/architecture-ru.md
git commit -m "Document test preprod and feature toggles"
```

## Task 10: Final Verification

**Files:**
- Verify: all files changed by Tasks 1-9.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 2: Run DB integration tests if local PostgreSQL is available**

Run:

```bash
RUN_DB_TESTS=true npm test -- test/feature-flag.repository.test.ts test/card.use-cases.test.ts test/card-ownership.use-cases.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit final fixes if verification required changes**

```bash
git status --short
git add src/configuration/configuration-service.ts knexfile.ts src/db/migrations/run.ts src/db/migrations/006_feature_flags.sql src/application/feature-flags.ts src/application/feature-flag.service.ts src/repositories/feature-flag.repository.ts src/services/index.ts src/bot/handlers/commands/transfer.ts src/bot/handlers/commands/accept-transfer.ts test/configuration-service.test.ts test/knexfile.test.ts test/migrations.run.test.ts test/feature-flags.test.ts test/feature-flag.repository.test.ts test/bot.feature-flags.test.ts .env.example .env.test.example docker-compose.yml docker-compose.test.yml .github/workflows/release-polling-vm.yml .github/scripts/deploy-yc-polling-vm.sh docs/deployment-yandex-cloud.md docs/architecture-ru.md
git commit -m "Stabilize environment and feature toggle rollout"
```

Этот commit нужен только если Step 1 или Step 2 потребовали follow-up edits.
