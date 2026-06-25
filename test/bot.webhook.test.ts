import test from 'node:test';
import assert from 'node:assert/strict';
import { Bot } from 'grammy';

test('webhook rejects requests without a valid Telegram secret token', async () => {
  const { createWebhookApp } = await import('../src/bot/webhook.ts');
  const app = createWebhookApp(new Bot('test-token'), 'expected-secret', false);

  const missingSecret = await app.inject({
    method: 'POST',
    url: '/webhook',
    payload: { update_id: 1 },
  });

  const invalidSecret = await app.inject({
    method: 'POST',
    url: '/webhook',
    headers: {
      'x-telegram-bot-api-secret-token': 'wrong-secret',
    },
    payload: { update_id: 1 },
  });

  assert.equal(missingSecret.statusCode, 401);
  assert.deepEqual(missingSecret.json(), { ok: false });
  assert.equal(invalidSecret.statusCode, 401);
  assert.deepEqual(invalidSecret.json(), { ok: false });

  await app.close();
});

test('webhook exposes health check endpoint', async () => {
  const { createWebhookApp } = await import('../src/bot/webhook.ts');
  const app = createWebhookApp(new Bot('test-token'), 'expected-secret', false);

  const response = await app.inject({
    method: 'GET',
    url: '/health',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });

  await app.close();
});
