import test from 'node:test';
import assert from 'node:assert/strict';
import { TransactionRepository } from '../src/repositories/transaction.repository.ts';
import { CardRepository } from '../src/repositories/card.repository.ts';
import { resetDatabase, closeDatabase } from './helpers/db.ts';

const runDbTests = process.env.RUN_DB_TESTS === '1';

test.beforeEach({ skip: !runDbTests }, async () => {
  await resetDatabase();
});

test.after({ skip: !runDbTests }, async () => {
  await closeDatabase();
});

test('transaction repository deletes transactions by card id', { skip: !runDbTests }, async () => {
  const cards = new CardRepository();
  const transactions = new TransactionRepository();
  const card = await cards.create('ION-DELETE-TX', 1000);

  await transactions.create({
    cardId: card.id,
    type: 'DEBIT',
    amount: 100,
    balanceAfter: 900,
  });

  assert.equal((await transactions.findByCardId(card.id)).length, 1);

  await transactions.deleteByCardId(card.id);

  assert.equal((await transactions.findByCardId(card.id)).length, 0);
});
