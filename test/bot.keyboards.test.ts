import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
