import test from 'node:test';
import assert from 'node:assert/strict';
import { hashTelegramUserId } from '../src/telegram/telegram-identity.ts';

test('hashTelegramUserId returns stable HMAC hex without raw Telegram id', () => {
  const secret = 'secret-secret-secret-secret-secret-1';

  const first = hashTelegramUserId(1001, secret);
  const second = hashTelegramUserId(1001, secret);
  const otherUser = hashTelegramUserId(1002, secret);
  const otherSecret = hashTelegramUserId(1001, 'secret-secret-secret-secret-secret-2');

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, otherUser);
  assert.notEqual(first, otherSecret);
  assert.equal(first.includes('1001'), false);
});
