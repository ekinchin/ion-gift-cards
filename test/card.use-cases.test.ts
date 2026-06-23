import test from 'node:test';
import assert from 'node:assert/strict';
import { cardService } from '../src/services/index.ts';
import { closeDatabase } from './helpers/db.ts';

test.after(async () => {
  await closeDatabase();
});

test('card service is available from composition root', () => {
  assert.equal(typeof cardService.getBalance, 'function');
  assert.equal(typeof cardService.debit, 'function');
  assert.equal(typeof cardService.credit, 'function');
});
