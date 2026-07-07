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
