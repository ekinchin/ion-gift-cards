import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerRoutes } from '../src/api/routes.ts';
import {
  cardOwnershipService,
  cardService,
  operatorRepository,
} from '../src/services/index.ts';
import { CardHistoryAccessDeniedError } from '../src/application/errors.ts';
import type { Card, Transaction } from '../src/types/index.ts';

const now = new Date('2026-06-28T10:00:00.000Z');

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: overrides.id ?? 'card-1',
    code: overrides.code ?? 'ION-TESTCARD01',
    balance: overrides.balance ?? 500,
    initial_amount: overrides.initial_amount ?? 500,
    is_active: overrides.is_active ?? true,
    created_at: overrides.created_at ?? now,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-1',
    card_id: overrides.card_id ?? 'card-1',
    type: overrides.type ?? 'DEBIT',
    amount: overrides.amount ?? 100,
    balance_after: overrides.balance_after ?? 400,
    description: overrides.description ?? 'Purchase',
    operator_id: overrides.operator_id ?? 'operator-1',
    created_at: overrides.created_at ?? now,
  };
}

function patchMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  return () => {
    target[key] = original;
  };
}

async function withApp<T>(callback: (app: ReturnType<typeof Fastify>) => Promise<T>) {
  const app = Fastify();
  await registerRoutes(app);
  try {
    return await callback(app);
  } finally {
    await app.close();
  }
}

test('GET card history denies owned-card history without owner or operator identity', async () => {
  const restorePublicHistory = patchMethod(cardService, 'getHistory', async () => []);
  const restoreOwnedHistory = patchMethod(cardOwnershipService, 'getHistoryByCode', async () => {
    throw new CardHistoryAccessDeniedError();
  });

  try {
    await withApp(async (app) => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/cards/ION-TESTCARD01/history',
      });

      assert.equal(response.statusCode, 403);
      assert.equal(response.json().code, 'CARD_HISTORY_ACCESS_DENIED');
    });
  } finally {
    restoreOwnedHistory();
    restorePublicHistory();
  }
});

test('GET card history allows the card owner', async () => {
  const card = makeCard();
  const transaction = makeTransaction();
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreOwnedHistory = patchMethod(cardOwnershipService, 'getHistoryByCode', async (_code, actor) => {
    assert.deepEqual(actor, { customerId: 'customer-1', operatorId: undefined });
    return { card, transactions: [transaction] };
  });
  const restorePublicHistory = patchMethod(cardService, 'getHistory', async () => {
    throw new Error('public history must not be used');
  });

  try {
    await withApp(async (app) => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/cards/ION-TESTCARD01/history',
        headers: { 'x-customer-telegram-id': '1001' },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.json().code, 'ION-TESTCARD01');
      assert.equal(response.json().transactions.length, 1);
    });
  } finally {
    restorePublicHistory();
    restoreOwnedHistory();
    restoreResolve();
  }
});

test('GET card history allows operators', async () => {
  const card = makeCard();
  const transaction = makeTransaction();
  const restoreOperator = patchMethod(operatorRepository, 'findByTelegramId', async () => ({
    id: 'operator-1',
    telegram_id: 2002,
    name: 'Operator',
    created_at: now,
  }));
  const restoreOwnedHistory = patchMethod(cardOwnershipService, 'getHistoryByCode', async (_code, actor) => {
    assert.deepEqual(actor, { customerId: undefined, operatorId: 'operator-1' });
    return { card, transactions: [transaction] };
  });
  const restorePublicHistory = patchMethod(cardService, 'getHistory', async () => {
    throw new Error('public history must not be used');
  });

  try {
    await withApp(async (app) => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/cards/ION-TESTCARD01/history',
        headers: { 'x-operator-telegram-id': '2002' },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.json().code, 'ION-TESTCARD01');
      assert.equal(response.json().transactions.length, 1);
    });
  } finally {
    restorePublicHistory();
    restoreOwnedHistory();
    restoreOperator();
  }
});
