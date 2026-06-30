import test from 'node:test';
import assert from 'node:assert/strict';
import { cardService } from '../src/services/index.ts';
import { createWebAppDataMessageHandler } from '../src/bot/handlers/messages/web-app-data.ts';

function patchMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  return () => {
    target[key] = original;
  };
}

test('web app data handler dispatches scan actions by action name', async () => {
  const replies: string[] = [];
  const restoreBalance = patchMethod(cardService, 'getBalance', async (code) => ({
    card: {
      id: 'card-1',
      code,
      balance: 750,
      initial_amount: 1000,
      is_active: true,
      created_at: new Date('2026-06-30T00:00:00.000Z'),
    },
    balance: 750,
  }));
  const handler = createWebAppDataMessageHandler({
    mode: 'polling',
    botToken: 'token',
    webAppUrl: 'https://example.test/qr',
  });
  const ctx = {
    message: {
      web_app_data: {
        data: JSON.stringify({ action: 'balance', code: 'ION-TESTCARD01' }),
      },
    },
    session: {
      action: 'balance',
      pendingCardOperation: { action: 'credit', amount: 100 },
    },
    async reply(text: string) {
      replies.push(text);
    },
  };

  try {
    await handler(ctx as never);

    assert.equal(ctx.session.action, undefined);
    assert.equal(ctx.session.pendingCardOperation, undefined);
    assert.equal(replies.length, 1);
    assert.match(replies[0]!, /ION-TESTCARD01/);
    assert.match(replies[0]!, /750/);
  } finally {
    restoreBalance();
  }
});
