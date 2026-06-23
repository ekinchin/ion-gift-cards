import test from 'node:test';
import assert from 'node:assert/strict';
import { CardUseCases } from '../src/application/card.use-cases.ts';
import type { CardRepository } from '../src/repositories/card.repository.ts';
import type { TransactionRepository } from '../src/repositories/transaction.repository.ts';
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

function createUseCasesWithUnusedRepos() {
  return new CardUseCases(
    {} as CardRepository,
    {} as TransactionRepository
  );
}

test('debit rejects non-positive amounts before database access', async () => {
  const useCases = createUseCasesWithUnusedRepos();

  await assert.rejects(
    () => useCases.debit('CARD-1', 0, '00000000-0000-0000-0000-000000000000'),
    /Amount must be greater than zero/
  );

  await assert.rejects(
    () => useCases.debit('CARD-1', -1, '00000000-0000-0000-0000-000000000000'),
    /Amount must be greater than zero/
  );
});

test('credit rejects non-positive amounts before database access', async () => {
  const useCases = createUseCasesWithUnusedRepos();

  await assert.rejects(
    () => useCases.credit('CARD-1', 0, '00000000-0000-0000-0000-000000000000'),
    /Amount must be greater than zero/
  );

  await assert.rejects(
    () => useCases.credit('CARD-1', -1, '00000000-0000-0000-0000-000000000000'),
    /Amount must be greater than zero/
  );
});
