import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPendingActionForMenuAction,
  parsePendingMenuActionInput,
} from '../src/bot/pending-menu-action.ts';

test('parsePendingMenuActionInput ignores text when no action is pending', () => {
  assert.deepEqual(parsePendingMenuActionInput(undefined, '1000'), { handled: false });
});

test('parsePendingMenuActionInput parses debit amount and description', () => {
  assert.deepEqual(parsePendingMenuActionInput('debit', '1000 lunch'), {
    handled: true,
    ok: true,
    action: 'debit',
    amount: 1000,
    description: 'lunch',
  });
});

test('parsePendingMenuActionInput parses credit amount', () => {
  assert.deepEqual(parsePendingMenuActionInput('credit', '1000'), {
    handled: true,
    ok: true,
    action: 'credit',
    amount: 1000,
    description: undefined,
  });
});

test('parsePendingMenuActionInput parses create amount', () => {
  assert.deepEqual(parsePendingMenuActionInput('create', '1000'), {
    handled: true,
    ok: true,
    action: 'create',
    amount: 1000,
  });
});

test('parsePendingMenuActionInput rejects invalid pending amount', () => {
  assert.deepEqual(parsePendingMenuActionInput('debit', 'abc'), {
    handled: true,
    ok: false,
    reason: 'invalid_amount',
  });
});

test('getPendingActionForMenuAction returns only actions that wait for amount text', () => {
  assert.equal(getPendingActionForMenuAction('debit'), 'debit');
  assert.equal(getPendingActionForMenuAction('credit'), 'credit');
  assert.equal(getPendingActionForMenuAction('create'), 'create');
  assert.equal(getPendingActionForMenuAction('balance'), undefined);
  assert.equal(getPendingActionForMenuAction('history'), undefined);
  assert.equal(getPendingActionForMenuAction('mycards'), undefined);
  assert.equal(getPendingActionForMenuAction('link'), undefined);
  assert.equal(getPendingActionForMenuAction('scan'), undefined);
});
