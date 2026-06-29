import test from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Transaction } from '../src/types/index.ts';
import { cardOwnershipService, cardService, operatorRepository } from '../src/services/index.ts';
import { handleMenuButton, handlePendingMenuAction } from '../src/bot/handlers/menu-handlers.ts';
import { createLinkCommandHandler } from '../src/bot/handlers/commands/link.ts';
import { unlinkCommandHandler } from '../src/bot/handlers/commands/unlink.ts';
import { menuButtonLabels } from '../src/bot/menu.ts';
import { NoOwnedCardsError } from '../src/application/errors.ts';

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

test('menu balance prompts to scan a card when there is no linked card', async () => {
  const ctx = makeContext();
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreBalance = patchMethod(cardOwnershipService, 'getOwnedBalance', async () => {
    throw new NoOwnedCardsError();
  });

  try {
    const handled = await handleMenuButton(ctx as never, menuButtonLabels.balance, telegramConfig);

    assert.equal(handled, true);
    assert.equal(ctx.replies.length, 1);
    assert.match(ctx.replies[0]!.text, /Отсканируйте QR-код карты/);
    const replyMarkup = (ctx.replies[0]!.options as { reply_markup: {
      keyboard: unknown;
      resize_keyboard: boolean;
      one_time_keyboard: boolean;
    } }).reply_markup;
    assert.deepEqual(replyMarkup.keyboard, [
      [{
        text: 'Сканировать QR для баланса',
        web_app: { url: 'https://example.com/qr?action=balance' },
      }],
      [{ text: menuButtonLabels.balance }, { text: menuButtonLabels.history }],
      [{ text: menuButtonLabels.mycards }, { text: menuButtonLabels.createPersonal }],
      [{ text: menuButtonLabels.link }, { text: menuButtonLabels.unlink }],
    ]);
    assert.equal(replyMarkup.resize_keyboard, true);
    assert.equal(replyMarkup.one_time_keyboard, true);
  } finally {
    restoreBalance();
    restoreResolve();
  }
});

test('menu history prompts to scan a card when there is no linked card', async () => {
  const ctx = makeContext();
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreHistory = patchMethod(cardOwnershipService, 'getOwnedHistory', async () => {
    throw new NoOwnedCardsError();
  });

  try {
    const handled = await handleMenuButton(ctx as never, menuButtonLabels.history, telegramConfig);

    assert.equal(handled, true);
    assert.equal(ctx.replies.length, 1);
    assert.match(ctx.replies[0]!.text, /Отсканируйте QR-код карты/);
    const replyMarkup = (ctx.replies[0]!.options as { reply_markup: {
      keyboard: unknown;
      resize_keyboard: boolean;
      one_time_keyboard: boolean;
    } }).reply_markup;
    assert.deepEqual(replyMarkup.keyboard, [
      [{
        text: 'Сканировать QR для истории',
        web_app: { url: 'https://example.com/qr?action=history' },
      }],
      [{ text: menuButtonLabels.balance }, { text: menuButtonLabels.history }],
      [{ text: menuButtonLabels.mycards }, { text: menuButtonLabels.createPersonal }],
      [{ text: menuButtonLabels.link }, { text: menuButtonLabels.unlink }],
    ]);
    assert.equal(replyMarkup.resize_keyboard, true);
    assert.equal(replyMarkup.one_time_keyboard, true);
  } finally {
    restoreHistory();
    restoreResolve();
  }
});

test('manual code after balance scan prompt shows public balance', async () => {
  const ctx = makeContext();
  ctx.session.action = 'balance';
  const restoreBalance = patchMethod(cardService, 'getBalance', async (code) => ({
    card: makeCard({ code }),
    balance: 750,
  }));

  try {
    const handled = await handlePendingMenuAction(ctx as never, 'ION-MANUAL01', telegramConfig);

    assert.equal(handled, true);
    assert.equal(ctx.session.action, undefined);
    assert.equal(ctx.replies.length, 1);
    assert.match(ctx.replies[0]!.text, /ION-MANUAL01/);
    assert.match(ctx.replies[0]!.text, /750/);
  } finally {
    restoreBalance();
  }
});

test('manual code after history scan prompt shows authorized public history', async () => {
  const card = makeCard({ code: 'ION-HISTORY01' });
  const ctx = makeContext();
  ctx.session.action = 'history';
  const restoreOperator = patchMethod(operatorRepository, 'findByTelegramId', async () => null);
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreHistory = patchMethod(cardOwnershipService, 'getHistoryByCode', async () => ({
    card,
    transactions: [makeTransaction({ card_id: card.id })],
  }));

  try {
    const handled = await handlePendingMenuAction(ctx as never, card.code, telegramConfig);

    assert.equal(handled, true);
    assert.equal(ctx.session.action, undefined);
    assert.equal(ctx.replies.length, 1);
    assert.match(ctx.replies[0]!.text, /Последние операции/);
    assert.match(ctx.replies[0]!.text, /ION-HISTORY01/);
  } finally {
    restoreHistory();
    restoreResolve();
    restoreOperator();
  }
});

test('operator menu actions require operator access before prompting for amount', async () => {
  const ctx = makeContext();
  const restoreOperator = patchMethod(operatorRepository, 'findByTelegramId', async () => null);

  try {
    const handled = await handleMenuButton(ctx as never, menuButtonLabels.debit, telegramConfig);

    assert.equal(handled, true);
    assert.equal(ctx.replies.length, 1);
    assert.equal(ctx.replies[0]!.text, '❌ У вас нет прав для этой операции');
    assert.equal(ctx.session.action, undefined);
  } finally {
    restoreOperator();
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

test('menu link manually entered code links the card instead of showing public balance', async () => {
  const card = makeCard();
  const ctx = makeContext();
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreList = patchMethod(cardOwnershipService, 'listCards', async () => []);
  const restoreLink = patchMethod(cardOwnershipService, 'linkCard', async (customerId, code) => ({
    ...card,
    code,
    balance: customerId === 'customer-1' ? card.balance : 0,
  }));

  try {
    const menuHandled = await handleMenuButton(ctx as never, menuButtonLabels.link, telegramConfig);
    assert.equal(menuHandled, true);
    assert.equal(ctx.session.action, 'link');

    const pendingHandled = await handlePendingMenuAction(ctx as never, card.code, telegramConfig);

    assert.equal(pendingHandled, true);
    assert.equal(ctx.session.action, undefined);
    assert.match(ctx.replies.at(-1)!.text, /Карта привязана/);
    assert.match(ctx.replies.at(-1)!.text, new RegExp(card.code));
    assert.match(ctx.replies.at(-1)!.text, new RegExp(String(card.balance)));
  } finally {
    restoreLink();
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
