import test from 'node:test';
import assert from 'node:assert/strict';
import { startCommandHandler } from '../src/bot/handlers/commands/start.ts';
import { cardOwnershipService, customerRepository, operatorRepository } from '../src/services/index.ts';

function makeContext() {
  const replies: Array<{ text: string; options?: unknown }> = [];
  return {
    from: { id: 1001, first_name: 'Test', last_name: 'User', username: 'test_user' },
    session: {},
    replies,
    async reply(replyText: string, options?: unknown) {
      replies.push({ text: replyText, options });
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

test('/start does not create a customer before personal data consent', async () => {
  const ctx = makeContext();
  let resolved = false;
  const restoreOperator = patchMethod(operatorRepository, 'findByTelegramUserIdHash', async () => null);
  const restoreLookup = patchMethod(customerRepository, 'findByTelegramUserIdHash', async () => null);
  const restoreList = patchMethod(cardOwnershipService, 'listCards', async () => []);
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => {
    resolved = true;
    return {
      customer: { id: 'customer-1' },
      identity: {},
    };
  });

  try {
    await startCommandHandler(ctx as never);

    assert.equal(resolved, false);
    assert.match(ctx.replies[0]!.text, /бот кофейни Ион/);
  } finally {
    restoreResolve();
    restoreList();
    restoreLookup();
    restoreOperator();
  }
});
