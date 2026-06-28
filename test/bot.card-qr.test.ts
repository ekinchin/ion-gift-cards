import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCardQrPng,
  formatCardQrCaption,
} from '../src/bot/card-qr.ts';

test('createCardQrPng returns a PNG image for the plain text card code', async () => {
  const qr = await createCardQrPng('ION-ABC123');

  assert.ok(Buffer.isBuffer(qr));
  assert.deepEqual([...qr.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(qr.length > 500);
});

test('formatCardQrCaption keeps the card code copyable in the caption', () => {
  const caption = formatCardQrCaption('✅ Ваша карта создана', {
    code: 'ION-ABC123',
    balance: 1500,
  });

  assert.equal(caption, '✅ Ваша карта создана\n💳 Код: ION-ABC123\n💰 Баланс: 1500 ₽');
});
