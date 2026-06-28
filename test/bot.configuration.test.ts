import test from 'node:test';
import assert from 'node:assert/strict';
import { configureBotApi } from '../src/bot/index.ts';

test('configureBotApi clears persistent web app menu button', async () => {
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

  await configureBotApi(bot as never);

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], {
    method: 'setChatMenuButton',
    payload: {
      menu_button: { type: 'default' },
    },
  });
});

test('configureBotApi clears persistent web app menu button when URL is absent', async () => {
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

  await configureBotApi(bot as never);

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], {
    method: 'setChatMenuButton',
    payload: {
      menu_button: { type: 'default' },
    },
  });
});
