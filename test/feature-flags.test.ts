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
