import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCreateCardAmount } from '../src/bot/create-card-command.ts';

test('parseCreateCardAmount reads amount from command payload', () => {
  assert.deepEqual(parseCreateCardAmount('1000'), { ok: true, amount: 1000 });
  assert.deepEqual(parseCreateCardAmount('  1000  '), { ok: true, amount: 1000 });
});

test('parseCreateCardAmount reports missing amount separately from invalid amount', () => {
  assert.deepEqual(parseCreateCardAmount(''), { ok: false, reason: 'missing' });
  assert.deepEqual(parseCreateCardAmount(undefined), { ok: false, reason: 'missing' });
});

test('parseCreateCardAmount rejects invalid amount payloads', () => {
  assert.deepEqual(parseCreateCardAmount('abc'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parseCreateCardAmount('0'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parseCreateCardAmount('-1'), { ok: false, reason: 'invalid' });
});
