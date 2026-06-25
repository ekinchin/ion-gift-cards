import test from 'node:test';
import assert from 'node:assert/strict';
import { configureBotApi } from '../src/bot/index.ts';
import type { TelegramConfig } from '../src/configuration/configuration-service.ts';

test('configureBotApi sets web app menu button from injected Telegram config', async () => {
  const calls: unknown[] = [];
  const bot = {
    api: {
      async setMyCommands(commands: unknown) {
        calls.push({ method: 'setMyCommands', commands });
      },
      async setChatMenuButton(payload: unknown) {
        calls.push({ method: 'setChatMenuButton', payload });
      },
    },
  };

  const telegramConfig: TelegramConfig = {
    mode: 'polling',
    botToken: 'test-token',
    webAppUrl: 'https://example.test/qr',
  };

  await configureBotApi(bot as never, telegramConfig);

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], {
    method: 'setChatMenuButton',
    payload: {
      menu_button: {
        type: 'web_app',
        text: 'Сканировать QR',
        web_app: { url: 'https://example.test/qr' },
      },
    },
  });
});

test('configureBotApi skips web app menu button when URL is absent', async () => {
  const calls: unknown[] = [];
  const bot = {
    api: {
      async setMyCommands(commands: unknown) {
        calls.push({ method: 'setMyCommands', commands });
      },
      async setChatMenuButton(payload: unknown) {
        calls.push({ method: 'setChatMenuButton', payload });
      },
    },
  };

  await configureBotApi(bot as never, {
    mode: 'polling',
    botToken: 'test-token',
  });

  assert.deepEqual(calls.map((call) => (call as { method: string }).method), ['setMyCommands']);
});
