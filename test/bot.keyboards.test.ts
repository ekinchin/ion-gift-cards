import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scanKeyboard,
  mainMenuKeyboard,
} from '../src/bot/handlers/keyboards.ts';
import { menuButtonLabels } from '../src/bot/menu.ts';

function keyboardLabels(keyboard: ReturnType<typeof mainMenuKeyboard>) {
  return keyboard.build().flat().map((button) => button.text);
}

test('mainMenuKeyboard hides operator actions for customers', () => {
  const labels = keyboardLabels(mainMenuKeyboard(false));

  assert.deepEqual(labels, [
    menuButtonLabels.balance,
    menuButtonLabels.history,
    menuButtonLabels.mycards,
    menuButtonLabels.createPersonal,
    menuButtonLabels.link,
    menuButtonLabels.unlink,
  ]);
});

test('mainMenuKeyboard shows operator actions for operators', () => {
  const labels = keyboardLabels(mainMenuKeyboard(true));

  assert.deepEqual(labels, [
    menuButtonLabels.balance,
    menuButtonLabels.history,
    menuButtonLabels.mycards,
    menuButtonLabels.createPersonal,
    menuButtonLabels.link,
    menuButtonLabels.unlink,
    menuButtonLabels.debit,
    menuButtonLabels.credit,
    menuButtonLabels.create,
  ]);
});

test('scanKeyboard uses a reply Web App button so Telegram sends web_app_data', () => {
  const keyboard = scanKeyboard(
    { mode: 'polling', botToken: 'token', webAppUrl: 'https://example.test/qr' },
    { action: 'link' }
  );

  assert.equal('inline_keyboard' in keyboard!, false);
  assert.deepEqual(keyboard?.keyboard, [[{
    text: 'Сканировать QR для привязки',
    web_app: {
      url: 'https://example.test/qr?action=link',
    },
  }]]);
  assert.equal(keyboard?.resize_keyboard, true);
  assert.equal(keyboard?.one_time_keyboard, true);
});
