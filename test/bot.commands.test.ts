import test from 'node:test';
import assert from 'node:assert/strict';
import { botCommands } from '../src/bot/handlers/commands.ts';

test('botCommands expose clear card creation commands', () => {
  const commandNames = botCommands.map((command) => command.command);

  assert.ok(commandNames.includes('my_card'));
  assert.equal(commandNames.includes('mycards'), false);
  assert.ok(commandNames.includes('create_my_card'));
  assert.ok(commandNames.includes('create_gift_card'));
  assert.equal(commandNames.includes('create'), false);
});
