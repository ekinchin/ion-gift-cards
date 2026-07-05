import test from 'node:test';
import assert from 'node:assert/strict';
import { createMyCardCommandHandler } from '../src/bot/handlers/commands/create-my-card.ts';
import { createLinkCommandHandler } from '../src/bot/handlers/commands/link.ts';
import { acceptTransferCommandHandler } from '../src/bot/handlers/commands/accept-transfer.ts';
import { transferCommandHandler } from '../src/bot/handlers/commands/transfer.ts';
import { handleMenuButton } from '../src/bot/handlers/menu-handlers.ts';
import { createTextMessageHandler } from '../src/bot/handlers/messages/text.ts';
import { cardOwnershipService, customerRepository } from '../src/services/index.ts';
import { userCopy } from '../src/copy.ts';
import type { Card } from '../src/types/index.ts';

const telegramConfig = {
  mode: 'polling' as const,
  botToken: 'token',
  identityHmacSecret: '12345678901234567890123456789012',
  webAppUrl: 'https://example.com/qr',
};

function makeCard(): Card {
  return {
    id: 'card-1',
    code: 'ION-CONSENT01',
    balance: 0,
    initial_amount: 0,
    is_active: true,
    created_at: new Date('2026-07-05T00:00:00.000Z'),
  };
}

function makeContext(text?: string) {
  const replies: Array<{ text: string; options?: unknown }> = [];
  const photos: Array<{ caption?: string }> = [];
  return {
    from: { id: 1001, first_name: 'Test', last_name: 'User', username: 'test_user' },
    message: text ? { text } : undefined,
    match: '',
    session: {},
    replies,
    photos,
    async reply(replyText: string, options?: unknown) {
      replies.push({ text: replyText, options });
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

test('/create_my_card asks for personal data consent before creating a card', async () => {
  const ctx = makeContext();
  let created = false;
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreLookup = patchMethod(customerRepository, 'findByTelegramUserIdHash', async () => null);
  const restoreConsent = patchMethod(customerRepository, 'findActiveConsent', async () => null);
  const restoreCreate = patchMethod(cardOwnershipService, 'createPersonalCard', async () => {
    created = true;
    return { card: makeCard(), created: true };
  });

  try {
    await createMyCardCommandHandler(ctx as never);

    assert.equal(created, false);
    assert.deepEqual(ctx.session.pendingConsentAction, { action: 'createPersonalCard' });
    assert.match(ctx.replies[0]!.text, /хранит и обрабатывает данные вашего Telegram-аккаунта/);
  } finally {
    restoreCreate();
    restoreConsent();
    restoreLookup();
    restoreResolve();
  }
});

test('/link with code asks for consent before linking a card', async () => {
  const ctx = { ...makeContext(), match: 'ION-CONSENT01' };
  let linked = false;
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreLookup = patchMethod(customerRepository, 'findByTelegramUserIdHash', async () => null);
  const restoreConsent = patchMethod(customerRepository, 'findActiveConsent', async () => null);
  const restoreLink = patchMethod(cardOwnershipService, 'linkCard', async () => {
    linked = true;
    return makeCard();
  });

  try {
    await createLinkCommandHandler(telegramConfig)(ctx as never);

    assert.equal(linked, false);
    assert.deepEqual(ctx.session.pendingConsentAction, { action: 'linkCard', code: 'ION-CONSENT01' });
    assert.match(ctx.replies[0]!.text, /личную карту в Telegram создать или привязать нельзя/);
  } finally {
    restoreLink();
    restoreConsent();
    restoreLookup();
    restoreResolve();
  }
});

test('reply keyboard link asks for consent before QR/manual link starts', async () => {
  const ctx = makeContext();
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreList = patchMethod(cardOwnershipService, 'listCards', async () => []);
  const restoreLookup = patchMethod(customerRepository, 'findByTelegramUserIdHash', async () => null);

  try {
    const handled = await handleMenuButton(ctx as never, '🔗 Привязать карту', telegramConfig);

    assert.equal(handled, true);
    assert.equal(ctx.session.action, undefined);
    assert.deepEqual(ctx.session.pendingConsentAction, { action: 'linkCard' });
    assert.match(ctx.replies[0]!.text, /хранит и обрабатывает данные/);
  } finally {
    restoreLookup();
    restoreList();
    restoreResolve();
  }
});

test('/accept_transfer asks for consent before accepting transfer', async () => {
  const ctx = { ...makeContext(), match: 'transfer-token' };
  let accepted = false;
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreLookup = patchMethod(customerRepository, 'findByTelegramUserIdHash', async () => null);
  const restoreAccept = patchMethod(cardOwnershipService, 'acceptTransfer', async () => {
    accepted = true;
    return makeCard();
  });

  try {
    await acceptTransferCommandHandler(ctx as never);

    assert.equal(accepted, false);
    assert.deepEqual(ctx.session.pendingConsentAction, { action: 'acceptTransfer', token: 'transfer-token' });
    assert.match(ctx.replies[0]!.text, /личную карту в Telegram создать или привязать нельзя/);
  } finally {
    restoreAccept();
    restoreLookup();
    restoreResolve();
  }
});

test('/link with active consent links immediately without extra confirmation', async () => {
  const ctx = { ...makeContext(), match: 'ION-CONSENT01' };
  let linked = false;
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreLookup = patchMethod(customerRepository, 'findByTelegramUserIdHash', async () => ({
    customer: { id: 'customer-1', created_at: new Date() },
    identity: {} as never,
  }));
  const restoreConsent = patchMethod(customerRepository, 'findActiveConsent', async () => ({} as never));
  const restoreLink = patchMethod(cardOwnershipService, 'linkCard', async () => {
    linked = true;
    return makeCard();
  });

  try {
    await createLinkCommandHandler(telegramConfig)(ctx as never);

    assert.equal(linked, true);
    assert.equal(ctx.session.pendingOwnershipConfirmation, undefined);
    assert.match(ctx.replies[0]!.text, /Карта привязана/);
    assert.match(ctx.replies[0]!.text, /ION-CONSENT01/);
  } finally {
    restoreLink();
    restoreConsent();
    restoreLookup();
    restoreResolve();
  }
});

test('/accept_transfer with active consent asks for explicit accept confirmation before accepting', async () => {
  const ctx = { ...makeContext(), match: 'transfer-token' };
  let accepted = false;
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreLookup = patchMethod(customerRepository, 'findByTelegramUserIdHash', async () => ({
    customer: { id: 'customer-1', created_at: new Date() },
    identity: {} as never,
  }));
  const restoreConsent = patchMethod(customerRepository, 'findActiveConsent', async () => ({} as never));
  const restoreAccept = patchMethod(cardOwnershipService, 'acceptTransfer', async () => {
    accepted = true;
    return makeCard();
  });

  try {
    await acceptTransferCommandHandler(ctx as never);

    assert.equal(accepted, false);
    assert.deepEqual(ctx.session.pendingOwnershipConfirmation, { action: 'acceptTransfer', token: 'transfer-token' });
    assert.match(ctx.replies[0]!.text, /история операций прежнего владельца будет удалена/);
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.replies[0]!.options)).reply_markup.keyboard[0][0], {
      text: userCopy.bot.ownershipConfirmation.acceptTransferButton,
    });
  } finally {
    restoreAccept();
    restoreConsent();
    restoreLookup();
    restoreResolve();
  }
});

test('/transfer asks for explicit transfer confirmation before creating token', async () => {
  const ctx = { ...makeContext(), match: 'ION-CONSENT01' };
  let transferStarted = false;
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreStart = patchMethod(cardOwnershipService, 'startTransfer', async () => {
    transferStarted = true;
    return { card: makeCard(), token: 'transfer-token', expiresAt: new Date('2026-07-05T12:00:00.000Z') };
  });

  try {
    await transferCommandHandler(ctx as never);

    assert.equal(transferStarted, false);
    assert.deepEqual(ctx.session.pendingOwnershipConfirmation, { action: 'transferCard', code: 'ION-CONSENT01' });
    assert.match(ctx.replies[0]!.text, /история операций прежнего владельца будет удалена/);
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.replies[0]!.options)).reply_markup.keyboard[0][0], {
      text: userCopy.bot.ownershipConfirmation.transferButton,
    });
  } finally {
    restoreStart();
    restoreResolve();
  }
});

test('declining personal data consent does not resume pending action', async () => {
  const ctx = makeContext(userCopy.bot.personalDataConsent.declineButton);
  ctx.session.pendingConsentAction = { action: 'linkCard', code: 'ION-CONSENT01' };
  let linked = false;
  let resolved = false;
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => {
    resolved = true;
    return {
      customer: { id: 'customer-1' },
      identity: {},
    };
  });
  const restoreLink = patchMethod(cardOwnershipService, 'linkCard', async () => {
    linked = true;
    return makeCard();
  });

  try {
    await createTextMessageHandler(telegramConfig)(ctx as never);

    assert.equal(linked, false);
    assert.equal(resolved, false);
    assert.equal(ctx.session.pendingConsentAction, undefined);
    assert.match(ctx.replies[0]!.text, /Без согласия/);
  } finally {
    restoreLink();
    restoreResolve();
  }
});

test('accepting personal data consent records it and resumes create card action', async () => {
  const ctx = makeContext(userCopy.bot.personalDataConsent.acceptButton);
  ctx.session.pendingConsentAction = { action: 'createPersonalCard' };
  let recorded = false;
  let created = false;
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreRecord = patchMethod(customerRepository, 'recordConsent', async () => {
    recorded = true;
    return {} as never;
  });
  const restoreLookup = patchMethod(customerRepository, 'findByTelegramUserIdHash', async () => ({
    customer: { id: 'customer-1', created_at: new Date() },
    identity: {} as never,
  }));
  const restoreConsent = patchMethod(customerRepository, 'findActiveConsent', async () => ({} as never));
  const restoreCreate = patchMethod(cardOwnershipService, 'createPersonalCard', async () => {
    created = true;
    return { card: makeCard(), created: true };
  });

  try {
    await createTextMessageHandler(telegramConfig)(ctx as never);

    assert.equal(recorded, true);
    assert.equal(created, true);
    assert.equal(ctx.session.pendingConsentAction, undefined);
    assert.match(ctx.replies[0]!.text, /Согласие сохранено/);
    assert.equal(ctx.photos.length, 1);
  } finally {
    restoreCreate();
    restoreConsent();
    restoreLookup();
    restoreRecord();
    restoreResolve();
  }
});
