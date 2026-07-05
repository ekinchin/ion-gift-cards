import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { migrate, type MigrationDb } from '../src/db/migrations/run.ts';

class FakeMigrationDb implements MigrationDb {
  readonly executedSql: string[] = [];
  readonly insertedMigrations: Array<{ version: string; filename: string }> = [];
  readonly appliedVersions: string[];

  constructor(appliedVersions: string[] = []) {
    this.appliedVersions = appliedVersions;
  }

  async raw(sql: string): Promise<unknown> {
    this.executedSql.push(sql);
    return undefined;
  }

  async transaction<T>(callback: (trx: MigrationDb) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async getAppliedMigrationVersions(): Promise<string[]> {
    return this.appliedVersions;
  }

  async insertMigration(version: string, filename: string): Promise<void> {
    this.insertedMigrations.push({ version, filename });
  }
}

function createMigrationDir(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'ion-migrations-'));

  for (const [filename, sql] of Object.entries(files)) {
    writeFileSync(join(dir, filename), sql);
  }

  return dir;
}

test('migrate applies only unapplied SQL files and records their versions', async () => {
  const migrationsDir = createMigrationDir({
    '001_initial.sql': 'CREATE TABLE cards (id uuid);',
    '002_card_owner_unlink.sql': 'ALTER TABLE card_owner_transfers ALTER COLUMN to_customer_id DROP NOT NULL;',
    '003_one_card_per_customer.sql': 'CREATE UNIQUE INDEX card_owners_one_card_per_customer ON card_owners (customer_id);',
  });
  const fakeDb = new FakeMigrationDb(['001']);

  const result = await migrate({ db: fakeDb, migrationsDir });

  assert.deepEqual(result, [
    { filename: '001_initial.sql', status: 'skipped' },
    { filename: '002_card_owner_unlink.sql', status: 'applied' },
    { filename: '003_one_card_per_customer.sql', status: 'applied' },
  ]);
  assert.match(fakeDb.executedSql[0], /CREATE TABLE IF NOT EXISTS schema_migrations/);
  assert.deepEqual(fakeDb.executedSql.slice(1), [
    'ALTER TABLE card_owner_transfers ALTER COLUMN to_customer_id DROP NOT NULL;',
    'CREATE UNIQUE INDEX card_owners_one_card_per_customer ON card_owners (customer_id);',
  ]);
  assert.deepEqual(fakeDb.insertedMigrations, [
    { version: '002', filename: '002_card_owner_unlink.sql' },
    { version: '003', filename: '003_one_card_per_customer.sql' },
  ]);
});

test('migrate rejects SQL files without a numeric version prefix', async () => {
  const migrationsDir = createMigrationDir({
    'initial.sql': 'CREATE TABLE cards (id uuid);',
  });
  const fakeDb = new FakeMigrationDb();

  await assert.rejects(
    () => migrate({ db: fakeDb, migrationsDir }),
    /Migration file must start with a numeric version prefix: initial\.sql/
  );
});

test('telegram personal data consent migration adds transition columns after receipts migration', async () => {
  const migrationsDir = join(import.meta.dirname, '..', 'src', 'db', 'migrations');
  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  assert.equal(
    migrationFiles.indexOf('005_telegram_personal_data_consent.sql'),
    migrationFiles.indexOf('004_transaction_receipts.sql') + 1
  );

  const initialSql = readFileSync(join(migrationsDir, '001_initial.sql'), 'utf8');
  assert.doesNotMatch(initialSql, /telegram_user_id_hmac/);
  assert.doesNotMatch(initialSql, /personal_data_consent_at/);
  assert.doesNotMatch(initialSql, /personal_data_consent_revoked_at/);

  const consentSql = readFileSync(
    join(migrationsDir, '005_telegram_personal_data_consent.sql'),
    'utf8'
  );

  assert.match(consentSql, /ALTER TABLE customer_identities/i);
  assert.match(consentSql, /ADD COLUMN IF NOT EXISTS telegram_user_id_hmac TEXT/i);
  assert.match(consentSql, /ADD COLUMN IF NOT EXISTS personal_data_consent_at TIMESTAMP/i);
  assert.match(consentSql, /ADD COLUMN IF NOT EXISTS personal_data_consent_revoked_at TIMESTAMP/i);
  assert.match(consentSql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_identities_provider_telegram_hmac/i);
  assert.match(consentSql, /ALTER TABLE operators/i);
  assert.match(consentSql, /ADD COLUMN IF NOT EXISTS telegram_user_id_hmac TEXT/i);
  assert.match(consentSql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_operators_telegram_user_id_hmac/i);
});

test('customer Telegram privacy cleanup migration drops raw provider user id', async () => {
  const migrationsDir = join(import.meta.dirname, '..', 'src', 'db', 'migrations');
  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  assert.equal(
    migrationFiles.indexOf('006_drop_customer_identity_provider_user_id.sql'),
    migrationFiles.indexOf('005_telegram_personal_data_consent.sql') + 1
  );

  const privacyCleanupSql = readFileSync(
    join(migrationsDir, '006_drop_customer_identity_provider_user_id.sql'),
    'utf8'
  );

  assert.match(privacyCleanupSql, /ALTER TABLE customer_identities/i);
  assert.match(privacyCleanupSql, /DROP CONSTRAINT IF EXISTS customer_identities_provider_provider_user_id_key/i);
  assert.match(privacyCleanupSql, /DROP COLUMN IF EXISTS provider_user_id/i);
  assert.doesNotMatch(privacyCleanupSql, /operators\s+.*DROP COLUMN/i);
});
