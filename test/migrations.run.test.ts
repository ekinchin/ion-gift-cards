import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  });
  const fakeDb = new FakeMigrationDb(['001']);

  const result = await migrate({ db: fakeDb, migrationsDir });

  assert.deepEqual(result, [
    { filename: '001_initial.sql', status: 'skipped' },
    { filename: '002_card_owner_unlink.sql', status: 'applied' },
  ]);
  assert.match(fakeDb.executedSql[0], /CREATE TABLE IF NOT EXISTS schema_migrations/);
  assert.deepEqual(fakeDb.executedSql.slice(1), [
    'ALTER TABLE card_owner_transfers ALTER COLUMN to_customer_id DROP NOT NULL;',
  ]);
  assert.deepEqual(fakeDb.insertedMigrations, [
    { version: '002', filename: '002_card_owner_unlink.sql' },
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
