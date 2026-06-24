import test from 'node:test';
import assert from 'node:assert/strict';
import { CardUseCases } from '../src/application/card.use-cases.ts';
import type { Knex } from 'knex';
import type { CardRepository } from '../src/repositories/card.repository.ts';
import type { TransactionRepository } from '../src/repositories/transaction.repository.ts';
import { cardService } from '../src/services/index.ts';
import { closeDatabase } from './helpers/db.ts';
import type { Card } from '../src/types/index.ts';

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

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: overrides.id ?? 'card-1',
    code: overrides.code ?? 'ION-ABCDEFGH2345',
    balance: overrides.balance ?? 100,
    initial_amount: overrides.initial_amount ?? 100,
    is_active: overrides.is_active ?? true,
    created_at: overrides.created_at ?? new Date('2026-06-25T00:00:00.000Z'),
  };
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

test('createCard generates a card code instead of accepting one from caller', async () => {
  const createdTransactions: unknown[] = [];
  const cardRepo = {
    async findByCode() {
      return null;
    },
    async create(code: string, initialAmount: number) {
      return makeCard({ code, balance: initialAmount, initial_amount: initialAmount });
    },
  } as CardRepository;
  const txRepo = {
    async create(transaction: unknown) {
      createdTransactions.push(transaction);
    },
  } as TransactionRepository;
  const useCases = new CardUseCases(
    cardRepo,
    txRepo,
    () => 'ION-ABCDEFGH2345',
    async (callback) => callback({} as Knex.Transaction)
  );

  const card = await useCases.createCard(250, 'operator-1');

  assert.equal(card.code, 'ION-ABCDEFGH2345');
  assert.equal(card.balance, 250);
  assert.equal(createdTransactions.length, 1);
});

test('createCard retries generated codes when a collision is found', async () => {
  const checkedCodes: string[] = [];
  const generatedCodes = ['ION-ABCDEFGH2345', 'ION-BCDEFGHJKLMN'];
  const cardRepo = {
    async findByCode(code: string) {
      checkedCodes.push(code);
      return code === 'ION-ABCDEFGH2345' ? makeCard({ code }) : null;
    },
    async create(code: string, initialAmount: number) {
      return makeCard({ code, balance: initialAmount, initial_amount: initialAmount });
    },
  } as CardRepository;
  const txRepo = {
    async create() {},
  } as TransactionRepository;
  const useCases = new CardUseCases(
    cardRepo,
    txRepo,
    () => generatedCodes.shift()!,
    async (callback) => callback({} as Knex.Transaction)
  );

  const card = await useCases.createCard(100, 'operator-1');

  assert.equal(card.code, 'ION-BCDEFGHJKLMN');
  assert.deepEqual(checkedCodes, ['ION-ABCDEFGH2345', 'ION-BCDEFGHJKLMN']);
});
