import test from 'node:test';
import assert from 'node:assert/strict';
import {
  menuButtonLabels,
  parseMenuButton,
} from '../src/bot/menu.ts';

test('parseMenuButton maps reply keyboard labels to menu actions', () => {
  assert.equal(parseMenuButton(menuButtonLabels.balance), 'balance');
  assert.equal(parseMenuButton(menuButtonLabels.history), 'history');
  assert.equal(parseMenuButton(menuButtonLabels.debit), 'debit');
  assert.equal(parseMenuButton(menuButtonLabels.credit), 'credit');
  assert.equal(parseMenuButton(menuButtonLabels.create), 'create');
});

test('parseMenuButton ignores regular card codes', () => {
  assert.equal(parseMenuButton('CARD-1'), null);
  assert.equal(parseMenuButton('📷 Сканировать QR'), null);
});
