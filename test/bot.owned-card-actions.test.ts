import test from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Transaction } from '../src/types/index.ts';
import { cardOwnershipService, operatorRepository } from '../src/services/index.ts';
import { handleMenuButton } from '../src/bot/handlers/menu-handlers.ts';
import { createLinkCommandHandler } from '../src/bot/handlers/commands/link.ts';
import { unlinkCommandHandler } from '../src/bot/handlers/commands/unlink.ts';

const now = new Date('2026-06-28T10:00:00.000Z');
const telegramConfig = { token: 'token', webAppUrl: 'https://example.com/qr' };

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

function makeContext() {
  const replies: Array<{ text: string; options?: unknown }> = [];
  const photos: Array<{ caption?: string }> = [];
  return {
    from: { id: 1001, first_name: 'Test', last_name: 'User', username: 'test_user' },
    session: {},
    replies,
    photos,
    async reply(text: string, options?: unknown) {
      replies.push({ text, options });
    },
    async replyWithPhoto(_photo: unknown, options?: { caption?: string }) {
      photos.push({ caption: options?.caption });
    },
  };
}

function patchMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  return () => {
    target[key] = original;
  };
}

test('menu balance shows the linked card without prompting for QR', async () => {
  const card = makeCard();
  const ctx = makeContext();
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreBalance = patchMethod(cardOwnershipService, 'getOwnedBalance', async () => ({
    card,
    balance: Number(card.balance),
  }));

  try {
    const handled = await handleMenuButton(ctx as never, '💳 Баланс', telegramConfig);

    assert.equal(handled, true);
    assert.equal(ctx.replies.length, 0);
    assert.equal(ctx.photos.length, 1);
    assert.match(ctx.photos[0]!.caption!, /ION-TESTCARD01/);
    assert.match(ctx.photos[0]!.caption!, /500/);
  } finally {
    restoreBalance();
    restoreResolve();
  }
});

test('menu history shows the linked card history without prompting for QR', async () => {
  const card = makeCard();
  const ctx = makeContext();
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreHistory = patchMethod(cardOwnershipService, 'getOwnedHistory', async () => ({
    card,
    transactions: [makeTransaction()],
  }));

  try {
    const handled = await handleMenuButton(ctx as never, '📋 История', telegramConfig);

    assert.equal(handled, true);
    assert.equal(ctx.photos.length, 0);
    assert.equal(ctx.replies.length, 1);
    assert.match(ctx.replies[0]!.text, /Последние операции/);
    assert.match(ctx.replies[0]!.text, /ION-TESTCARD01/);
  } finally {
    restoreHistory();
    restoreResolve();
  }
});

test('link command without a code shows the existing card instead of a scan prompt', async () => {
  const card = makeCard();
  const ctx = makeContext();
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreList = patchMethod(cardOwnershipService, 'listCards', async () => [card]);
  const handler = createLinkCommandHandler(telegramConfig);

  try {
    await handler({ ...ctx, match: '' } as never);

    assert.equal(ctx.replies.length, 0);
    assert.equal(ctx.photos.length, 1);
    assert.match(ctx.photos[0]!.caption!, /уже есть карта/i);
    assert.match(ctx.photos[0]!.caption!, /ION-TESTCARD01/);
  } finally {
    restoreList();
    restoreResolve();
  }
});

test('unlink command without a code unlinks the current card and replies with QR recovery data', async () => {
  const card = makeCard();
  const ctx = makeContext();
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreUnlink = patchMethod(cardOwnershipService, 'unlinkCurrentCard', async () => card);

  try {
    await unlinkCommandHandler({ ...ctx, match: '' } as never);

    assert.equal(ctx.replies.length, 0);
    assert.equal(ctx.photos.length, 1);
    assert.match(ctx.photos[0]!.caption!, /Карта отвязана/);
    assert.match(ctx.photos[0]!.caption!, /ION-TESTCARD01/);
    assert.match(ctx.photos[0]!.caption!, /500/);
  } finally {
    restoreUnlink();
    restoreResolve();
  }
});

test('menu unlink uses the current linked card', async () => {
  const card = makeCard();
  const ctx = makeContext();
  const restoreOperator = patchMethod(operatorRepository, 'findByTelegramId', async () => null);
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreUnlink = patchMethod(cardOwnershipService, 'unlinkCurrentCard', async () => card);

  try {
    const handled = await handleMenuButton(ctx as never, '⛓️ Отвязать карту', telegramConfig);

    assert.equal(handled, true);
    assert.equal(ctx.photos.length, 1);
    assert.match(ctx.photos[0]!.caption!, /Карта отвязана/);
  } finally {
    restoreUnlink();
    restoreResolve();
    restoreOperator();
  }
});
