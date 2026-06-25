import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCardOperationCommand } from '../src/bot/handlers/card-operation-command.ts';

test('parseCardOperationCommand parses direct card operation arguments', () => {
  const result = parseCardOperationCommand('CARD-1 150 lunch bonus');

  assert.deepEqual(result, {
    ok: true,
    mode: 'direct',
    code: 'CARD-1',
    amount: 150,
    description: 'lunch bonus',
  });
});

test('parseCardOperationCommand parses scan operation arguments', () => {
  const result = parseCardOperationCommand('150 lunch bonus');

  assert.deepEqual(result, {
    ok: true,
    mode: 'scan',
    amount: 150,
    description: 'lunch bonus',
  });
});

test('parseCardOperationCommand reports missing arguments', () => {
  const result = parseCardOperationCommand(undefined);

  assert.deepEqual(result, {
    ok: false,
    reason: 'missing',
  });
});

test('parseCardOperationCommand reports invalid amount', () => {
  const result = parseCardOperationCommand('not-a-number');

  assert.deepEqual(result, {
    ok: false,
    reason: 'invalid-amount',
  });
});
