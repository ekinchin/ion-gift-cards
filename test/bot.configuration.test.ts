import test from 'node:test';
import assert from 'node:assert/strict';
import { configureBotApi } from '../src/bot/index.ts';

test('configureBotApi clears persistent web app menu button', async () => {
  const calls: unknown[] = [];
  const bot = {
    api: {
      async setMyCommands(commands: unknown, options?: unknown) {
        calls.push({ method: 'setMyCommands', commands, options });
      },
      async setChatMenuButton(payload: unknown) {
        calls.push({ method: 'setChatMenuButton', payload });
      },
    },
  };

  await configureBotApi(bot as never, { getAll: async () => [] });

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
      async setMyCommands(commands: unknown, options?: unknown) {
        calls.push({ method: 'setMyCommands', commands, options });
      },
      async setChatMenuButton(payload: unknown) {
        calls.push({ method: 'setChatMenuButton', payload });
      },
    },
  };

  await configureBotApi(bot as never, { getAll: async () => [] });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], {
    method: 'setChatMenuButton',
    payload: {
      menu_button: { type: 'default' },
    },
  });
});

test('configureBotApi hides operator commands from the default command menu', async () => {
  const calls: Array<{ method: string; commands?: Array<{ command: string }>; options?: unknown; payload?: unknown }> = [];
  const bot = {
    api: {
      async setMyCommands(commands: Array<{ command: string }>, options?: unknown) {
        calls.push({ method: 'setMyCommands', commands, options });
      },
      async setChatMenuButton(payload: unknown) {
        calls.push({ method: 'setChatMenuButton', payload });
      },
    },
  };

  await configureBotApi(bot as never, { getAll: async () => [] });

  const defaultCommandsCall = calls.find((call) => call.method === 'setMyCommands');
  assert.ok(defaultCommandsCall);
  const defaultCommandNames = defaultCommandsCall.commands!.map((command) => command.command);
  assert.equal(defaultCommandNames.includes('debit'), false);
  assert.equal(defaultCommandNames.includes('credit'), false);
  assert.equal(defaultCommandNames.includes('create_gift_card'), false);
});

test('configureBotApi exposes operator commands only in operator chat scopes', async () => {
  const calls: Array<{ method: string; commands?: Array<{ command: string }>; options?: unknown; payload?: unknown }> = [];
  const bot = {
    api: {
      async setMyCommands(commands: Array<{ command: string }>, options?: unknown) {
        calls.push({ method: 'setMyCommands', commands, options });
      },
      async setChatMenuButton(payload: unknown) {
        calls.push({ method: 'setChatMenuButton', payload });
      },
    },
  };

  await configureBotApi(bot as never, {
    getAll: async () => [
      { id: 'operator-1', telegram_id: 1001, name: 'Operator', is_active: true, created_at: new Date() },
    ],
  });

  const scopedCommandsCall = calls.find((call) => (
    call.method === 'setMyCommands'
    && (JSON.stringify(call.options)?.includes('"chat_id":1001') ?? false)
  ));
  assert.ok(scopedCommandsCall);
  const scopedCommandNames = scopedCommandsCall.commands!.map((command) => command.command);
  assert.ok(scopedCommandNames.includes('debit'));
  assert.ok(scopedCommandNames.includes('credit'));
  assert.ok(scopedCommandNames.includes('create_gift_card'));
});
