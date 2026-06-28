import test from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyRequest } from 'fastify';
import { requireCustomer, requireOperator, resolveApiActor } from '../src/api/auth.ts';
import { cardOwnershipService, operatorRepository } from '../src/services/index.ts';

const now = new Date('2026-06-28T10:00:00.000Z');

function patchMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  return () => {
    target[key] = original;
  };
}

test('requireOperator rejects requests without an operator header', async () => {
  const operator = await requireOperator({
    headers: {},
  } as FastifyRequest);

  assert.equal(operator, null);
});

test('requireOperator rejects non-numeric operator headers', async () => {
  const operator = await requireOperator({
    headers: {
      'x-operator-telegram-id': 'not-a-number',
    },
  } as unknown as FastifyRequest);

  assert.equal(operator, null);
});

test('requireCustomer rejects requests without a customer header', async () => {
  const customer = await requireCustomer({
    headers: {},
  } as FastifyRequest);

  assert.equal(customer, null);
});

test('requireCustomer rejects non-numeric customer headers', async () => {
  const customer = await requireCustomer({
    headers: {
      'x-customer-telegram-id': 'not-a-number',
    },
  } as unknown as FastifyRequest);

  assert.equal(customer, null);
});

test('resolveApiActor combines customer and operator identities', async () => {
  const restoreOperator = patchMethod(operatorRepository, 'findByTelegramId', async () => ({
    id: 'operator-1',
    telegram_id: 2002,
    name: 'Operator',
    is_active: true,
    created_at: now,
  }));
  const restoreCustomer = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));

  try {
    const actor = await resolveApiActor({
      headers: {
        'x-operator-telegram-id': '2002',
        'x-customer-telegram-id': '1001',
      },
    } as unknown as FastifyRequest);

    assert.deepEqual(actor, {
      customerId: 'customer-1',
      operatorId: 'operator-1',
    });
  } finally {
    restoreCustomer();
    restoreOperator();
  }
});
