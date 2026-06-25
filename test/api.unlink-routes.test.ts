import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerRoutes } from '../src/api/routes.ts';
import { cardOwnershipService, operatorRepository } from '../src/services/index.ts';
import type { Card } from '../src/types/index.ts';

const card: Card = {
  id: 'card-1',
  code: 'CARD-1',
  balance: 1000,
  initial_amount: 1000,
  is_active: true,
  created_at: new Date('2026-06-25T10:00:00.000Z'),
};

test('admin unlink endpoint unlinks card by code', async () => {
  const app = Fastify();
  const originalFindOperator = operatorRepository.findByTelegramId;
  const originalUnlinkByCode = cardOwnershipService.unlinkCardByCode;
  let unlinkArgs: unknown[] | null = null;

  operatorRepository.findByTelegramId = async () => ({
    id: 'operator-1',
    telegram_id: 1001,
    name: 'Operator',
    is_active: true,
    created_at: new Date('2026-06-25T10:00:00.000Z'),
  });
  cardOwnershipService.unlinkCardByCode = async (...args) => {
    unlinkArgs = args;
    return card;
  };

  try {
    await registerRoutes(app);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/cards/CARD-1/owner',
      headers: { 'x-operator-telegram-id': '1001' },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { code: 'CARD-1', unlinked: true });
    assert.deepEqual(unlinkArgs, ['CARD-1', 'operator-1']);
  } finally {
    operatorRepository.findByTelegramId = originalFindOperator;
    cardOwnershipService.unlinkCardByCode = originalUnlinkByCode;
    await app.close();
  }
});

test('customer unlink endpoint unlinks current customer card without code', async () => {
  const app = Fastify();
  const originalResolveCustomer = cardOwnershipService.resolveCustomer;
  const originalUnlinkCurrentCard = cardOwnershipService.unlinkCurrentCard;
  let unlinkCustomerId: string | null = null;

  cardOwnershipService.resolveCustomer = async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  });
  cardOwnershipService.unlinkCurrentCard = async (customerId) => {
    unlinkCustomerId = customerId;
    return card;
  };

  try {
    await registerRoutes(app);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/me/card',
      headers: { 'x-customer-telegram-id': '2002' },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { code: 'CARD-1', unlinked: true });
    assert.equal(unlinkCustomerId, 'customer-1');
  } finally {
    cardOwnershipService.resolveCustomer = originalResolveCustomer;
    cardOwnershipService.unlinkCurrentCard = originalUnlinkCurrentCard;
    await app.close();
  }
});
