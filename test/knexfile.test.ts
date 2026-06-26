import test from 'node:test';
import assert from 'node:assert/strict';
import { createKnexConfig } from '../knexfile.ts';

test('Knex config is created from typed database configuration', () => {
  assert.deepEqual(createKnexConfig({
    host: 'db.internal',
    port: 5433,
    user: 'app',
    password: 'secret',
    name: 'gift_cards',
    ssl: false,
    pool: {
      min: 1,
      max: 6,
    },
  }), {
    client: 'pg',
    connection: {
      host: 'db.internal',
      port: 5433,
      user: 'app',
      password: 'secret',
      database: 'gift_cards',
      keepAlive: true,
      keepAliveInitialDelayMillis: 1000,
      connectionTimeoutMillis: 5000,
    },
    pool: {
      min: 1,
      max: 6,
      idleTimeoutMillis: 5000,
      reapIntervalMillis: 1000,
      acquireTimeoutMillis: 10000,
      createTimeoutMillis: 10000,
      destroyTimeoutMillis: 5000,
      createRetryIntervalMillis: 200,
    },
  });
});

test('Knex config passes SSL settings to PostgreSQL connection', () => {
  assert.deepEqual(createKnexConfig({
    host: 'db.internal',
    port: 6432,
    user: 'app',
    password: 'secret',
    name: 'gift_cards',
    ssl: true,
    pool: {
      min: 0,
      max: 2,
    },
  }).connection, {
    host: 'db.internal',
    port: 6432,
    user: 'app',
    password: 'secret',
    database: 'gift_cards',
    keepAlive: true,
    keepAliveInitialDelayMillis: 1000,
    connectionTimeoutMillis: 5000,
    ssl: {
      rejectUnauthorized: false,
    },
  });
});
