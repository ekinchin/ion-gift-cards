import type { Knex } from 'knex';
import { ConfigurationService } from '../../configuration/configuration-service.ts';
import { db as knexDb } from '../knex.ts';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type MigrationStatus = 'applied' | 'skipped';

export interface MigrationResult {
  filename: string;
  status: MigrationStatus;
}

export interface MigrationDb {
  raw(sql: string): Promise<unknown>;
  transaction<T>(callback: (trx: MigrationDb) => Promise<T>): Promise<T>;
  getAppliedMigrationVersions(): Promise<string[]>;
  insertMigration(version: string, filename: string): Promise<void>;
}

class KnexMigrationDb implements MigrationDb {
  readonly #client: Knex | Knex.Transaction;

  constructor(client: Knex | Knex.Transaction) {
    this.#client = client;
  }

  async raw(sql: string): Promise<unknown> {
    return this.#client.raw(sql);
  }

  async transaction<T>(callback: (trx: MigrationDb) => Promise<T>): Promise<T> {
    if (!('transaction' in this.#client)) {
      return callback(this);
    }

    return this.#client.transaction(async (trx) => callback(new KnexMigrationDb(trx)));
  }

  async getAppliedMigrationVersions(): Promise<string[]> {
    const rows = await this.#client('schema_migrations')
      .select<{ version: string }[]>('version')
      .orderBy('version', 'asc');

    return rows.map((row) => row.version);
  }

  async insertMigration(version: string, filename: string): Promise<void> {
    await this.#client('schema_migrations').insert({ version, filename });
  }
}

function parseMigrationVersion(filename: string): string {
  const match = filename.match(/^(\d+)_.*\.sql$/);

  if (!match) {
    throw new Error(`Migration file must start with a numeric version prefix: ${filename}`);
  }

  return match[1];
}

function getMigrationFiles(migrationsDir: string) {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const seenVersions = new Set<string>();

  return files.map((filename) => {
    const version = parseMigrationVersion(filename);

    if (seenVersions.has(version)) {
      throw new Error(`Duplicate migration version: ${version}`);
    }

    seenVersions.add(version);
    return { filename, version };
  });
}

async function ensureMigrationHistoryTable(db: MigrationDb) {
  await db.raw(`
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE schema_migrations IS 'История примененных SQL-миграций.';
COMMENT ON COLUMN schema_migrations.version IS 'Версия миграции из числового префикса имени файла.';
COMMENT ON COLUMN schema_migrations.filename IS 'Полное имя примененного SQL-файла миграции.';
COMMENT ON COLUMN schema_migrations.applied_at IS 'Дата и время успешного применения миграции.';
`);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function ensureApplicationSchema(db: MigrationDb, schema: string) {
  await db.raw(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)};`);
}

export async function migrate(options: {
  db?: MigrationDb;
  migrationsDir?: string;
  schema?: string;
} = {}): Promise<MigrationResult[]> {
  const migrationDb = options.db ?? new KnexMigrationDb(knexDb);
  const migrationsDir = options.migrationsDir ?? __dirname;
  const schema = options.schema ?? ConfigurationService.fromEnv().getDatabaseConfig().schema;
  const migrations = getMigrationFiles(migrationsDir);
  const result: MigrationResult[] = [];

  await ensureApplicationSchema(migrationDb, schema);
  await ensureMigrationHistoryTable(migrationDb);

  const appliedVersions = new Set(await migrationDb.getAppliedMigrationVersions());

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      result.push({ filename: migration.filename, status: 'skipped' });
      continue;
    }

    const sql = readFileSync(join(migrationsDir, migration.filename), 'utf-8');

    await migrationDb.transaction(async (trx) => {
      await trx.raw(sql);
      await trx.insertMigration(migration.version, migration.filename);
    });

    result.push({ filename: migration.filename, status: 'applied' });
  }

  return result;
}

async function runCli() {
  console.log('Running migrations...');

  const result = await migrate();

  for (const migration of result) {
    const mark = migration.status === 'applied' ? '✓' : '-';
    console.log(`${mark} ${migration.filename} ${migration.status}`);
  }

  console.log('Migrations completed!');
  await knexDb.destroy();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(async (err) => {
    console.error('Migration failed:', err);
    await knexDb.destroy();
    process.exit(1);
  });
}
