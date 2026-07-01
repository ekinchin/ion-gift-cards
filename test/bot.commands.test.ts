import test from 'node:test';
import assert from 'node:assert/strict';
import { botCommands, operatorBotCommands } from '../src/bot/handlers/commands.ts';

test('botCommands expose only customer-safe card commands', () => {
  const commandNames = botCommands.map((command) => command.command);

  assert.ok(commandNames.includes('my_card'));
  assert.equal(commandNames.includes('mycards'), false);
  assert.ok(commandNames.includes('create_my_card'));
  assert.equal(commandNames.includes('create_gift_card'), false);
  assert.equal(commandNames.includes('create'), false);
});

test('operatorBotCommands expose operator card commands', () => {
  const commandNames = operatorBotCommands.map((command) => command.command);

  assert.ok(commandNames.includes('create_gift_card'));
  assert.ok(commandNames.includes('debit'));
  assert.ok(commandNames.includes('credit'));
});
