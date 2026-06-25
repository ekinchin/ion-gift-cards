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
    },
    pool: {
      min: 1,
      max: 6,
    },
  });
});
