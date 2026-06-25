import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePoolConfig } from '../knexfile.ts';

test('Knex uses conservative serverless pool defaults', () => {
  assert.deepEqual(resolvePoolConfig({}), {
    min: 0,
    max: 2,
  });
});

test('Knex pool size can be configured through ENV', () => {
  assert.deepEqual(resolvePoolConfig({
    DB_POOL_MIN: '1',
    DB_POOL_MAX: '6',
  }), {
    min: 1,
    max: 6,
  });
});
