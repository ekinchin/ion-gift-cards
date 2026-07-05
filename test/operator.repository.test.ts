import test from 'node:test';
import assert from 'node:assert/strict';
import { OperatorRepository } from '../src/repositories/operator.repository.ts';
import { db } from '../src/db/knex.ts';
import { resetDatabase, closeDatabase } from './helpers/db.ts';

const runDbTests = process.env.RUN_DB_TESTS === '1';

test.beforeEach({ skip: !runDbTests }, async () => {
  await resetDatabase();
});

test.after({ skip: !runDbTests }, async () => {
  await closeDatabase();
});

test('operator repository finds active operators by Telegram HMAC, not raw Telegram id', { skip: !runDbTests }, async () => {
  const repository = new OperatorRepository();

  await db('operators').insert({
    telegram_id: 777001,
    telegram_user_id_hmac: 'operator-hash',
    name: 'Operator',
    is_active: true,
  });
  await db('operators').insert({
    telegram_id: 777002,
    telegram_user_id_hmac: 'inactive-operator-hash',
    name: 'Inactive Operator',
    is_active: false,
  });

  const operator = await repository.findByTelegramUserIdHash('operator-hash');

  assert.equal(operator?.telegram_id, 777001);
  assert.equal(operator?.telegram_user_id_hmac, 'operator-hash');
  assert.equal(await repository.findByTelegramUserIdHash('inactive-operator-hash'), null);
  assert.equal(await repository.findByTelegramUserIdHash('777001'), null);
});

test('operator repository creates operators with Telegram HMAC for authorization', { skip: !runDbTests }, async () => {
  const repository = new OperatorRepository();

  const operator = await repository.create(777003, 'operator-create-hash', 'Created Operator');

  assert.equal(operator.telegram_id, 777003);
  assert.equal(operator.telegram_user_id_hmac, 'operator-create-hash');
  assert.equal((await repository.findByTelegramUserIdHash('operator-create-hash'))?.id, operator.id);
});
