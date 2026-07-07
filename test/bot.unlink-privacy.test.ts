import test from 'node:test';
import assert from 'node:assert/strict';
import { unlinkCommandHandler } from '../src/bot/handlers/commands/unlink.ts';
import { createTextMessageHandler } from '../src/bot/handlers/messages/text.ts';
import { cardOwnershipService, customerRepository, operatorRepository } from '../src/services/index.ts';
import { userCopy } from '../src/copy.ts';
import type { Card } from '../src/types/index.ts';
import { menuButtonLabels } from '../src/bot/menu.ts';

const telegramConfig = {
  mode: 'polling' as const,
  botToken: 'token',
  identityHmacSecret: '12345678901234567890123456789012',
  webAppUrl: 'https://example.com/qr',
};

function makeCard(): Card {
  return {
    id: 'card-1',
    code: 'ION-UNLINK01',
    balance: 500,
    initial_amount: 500,
    is_active: true,
    created_at: new Date('2026-07-05T00:00:00.000Z'),
  };
}

function makeContext(text?: string) {
  const replies: Array<{ text: string; options?: unknown }> = [];
  const photos: Array<{ caption?: string; options?: unknown }> = [];
  return {
    from: { id: 1001, first_name: 'Test' },
    message: text ? { text } : undefined,
    match: '',
    session: {},
    replies,
    photos,
    async reply(replyText: string, options?: unknown) {
      replies.push({ text: replyText, options });
    },
    async replyWithPhoto(_photo: unknown, options?: { caption?: string }) {
      photos.push({ caption: options?.caption, options });
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

test('/unlink asks for explicit privacy confirmation before unlinking', async () => {
  const ctx = makeContext();
  let unlinked = false;
  const restoreUnlink = patchMethod(cardOwnershipService, 'unlinkCurrentCard', async () => {
    unlinked = true;
    return makeCard();
  });

  try {
    await unlinkCommandHandler(ctx as never);

    assert.equal(unlinked, false);
    assert.deepEqual(ctx.session.pendingUnlinkConfirmation, {});
    assert.match(ctx.replies[0]!.text, /История операций по этой карте будет удалена/);
    assert.match(ctx.replies[0]!.text, /отказом от дальнейшего хранения и обработки персональных данных/);
  } finally {
    restoreUnlink();
  }
});

test('cancelling unlink keeps pending data untouched by the use case', async () => {
  const ctx = makeContext(userCopy.bot.unlinkPrivacy.cancelButton);
  ctx.session.pendingUnlinkConfirmation = {};
  let unlinked = false;
  const restoreUnlink = patchMethod(cardOwnershipService, 'unlinkCurrentCard', async () => {
    unlinked = true;
    return makeCard();
  });

  try {
    await createTextMessageHandler(telegramConfig)(ctx as never);

    assert.equal(unlinked, false);
    assert.equal(ctx.session.pendingUnlinkConfirmation, undefined);
    assert.match(ctx.replies[0]!.text, /Отвязка отменена/);
  } finally {
    restoreUnlink();
  }
});

test('confirming unlink performs unlink and returns QR recovery data', async () => {
  const ctx = makeContext(userCopy.bot.unlinkPrivacy.confirmButton);
  ctx.session.pendingUnlinkConfirmation = {};
  const restoreLookup = patchMethod(customerRepository, 'findByTelegramUserIdHash', async () => ({
    customer: { id: 'customer-1', created_at: new Date('2026-07-05T00:00:00.000Z') },
    identity: {} as never,
  }));
  const restoreUnlink = patchMethod(cardOwnershipService, 'unlinkCurrentCard', async () => makeCard());
  const restoreOperator = patchMethod(operatorRepository, 'findByTelegramUserIdHash', async () => null);

  try {
    await createTextMessageHandler(telegramConfig)(ctx as never);

    assert.equal(ctx.session.pendingUnlinkConfirmation, undefined);
    assert.equal(ctx.replies.length, 0);
    assert.equal(ctx.photos.length, 1);
    assert.match(ctx.photos[0]!.caption!, /Карта отвязана/);
    assert.match(ctx.photos[0]!.caption!, /ION-UNLINK01/);
    assert.match(ctx.photos[0]!.caption!, /500/);
    const keyboard = JSON.parse(JSON.stringify(ctx.photos[0]!.options)).reply_markup.keyboard
      .flat()
      .map((button: { text: string }) => button.text);
    assert.deepEqual(keyboard, [
      menuButtonLabels.balance,
      menuButtonLabels.history,
      menuButtonLabels.mycards,
      menuButtonLabels.createPersonal,
      menuButtonLabels.link,
    ]);
    assert.equal(keyboard.includes(userCopy.bot.unlinkPrivacy.confirmButton), false);
    assert.equal(keyboard.includes(userCopy.bot.unlinkPrivacy.cancelButton), false);
  } finally {
    restoreOperator();
    restoreUnlink();
    restoreLookup();
  }
});
