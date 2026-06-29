import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatReceiptSkipReason,
  formatReceiptVerificationStatus,
  parseReceiptSkipInput,
  promptForReceiptAttachment,
} from '../src/bot/receipt-flow.ts';

const telegramConfig = { mode: 'polling' as const, botToken: 'token', webAppUrl: 'https://example.test/qr' };

function makeContext() {
  const replies: Array<{ text: string; options?: { reply_markup?: { keyboard?: Array<Array<{ text: string; web_app?: { url: string } }>> } } }> = [];
  return {
    session: {},
    replies,
    async reply(text: string, options?: unknown) {
      replies.push({ text, options: options as never });
    },
  };
}

test('promptForReceiptAttachment stores pending transaction and asks operator to scan receipt', async () => {
  const ctx = makeContext();

  await promptForReceiptAttachment(ctx as never, telegramConfig, {
    transactionId: 'tx-1',
    operationType: 'DEBIT',
  });

  assert.deepEqual(ctx.session, {
    pendingReceipt: {
      transactionId: 'tx-1',
      operationType: 'DEBIT',
    },
  });
  assert.match(ctx.replies[0]!.text, /Отсканируйте QR чека/);
  assert.match(ctx.replies[0]!.text, /нечитаемый QR/);
  assert.doesNotMatch(ctx.replies[0]!.text, /qr_unreadable|receipt_lost|cash_register_without_qr|technical_error/);
  assert.match(
    ctx.replies[0]!.options!.reply_markup!.keyboard![0]![0]!.web_app!.url,
    /action=receipt/
  );
});

test('parseReceiptSkipInput parses fixed skip reasons and comments', () => {
  assert.deepEqual(parseReceiptSkipInput('qr_unreadable'), {
    ok: true,
    reason: 'qr_unreadable',
    comment: undefined,
  });
  assert.deepEqual(parseReceiptSkipInput('other касса зависла'), {
    ok: true,
    reason: 'other',
    comment: 'касса зависла',
  });
  assert.deepEqual(parseReceiptSkipInput('техническая ошибка'), {
    ok: true,
    reason: 'technical_error',
    comment: undefined,
  });
  assert.deepEqual(parseReceiptSkipInput('другое касса зависла'), {
    ok: true,
    reason: 'other',
    comment: 'касса зависла',
  });
  assert.deepEqual(parseReceiptSkipInput('unknown'), {
    ok: false,
    reason: 'invalid',
  });
});

test('receipt result labels are localized for chat replies', () => {
  assert.equal(formatReceiptVerificationStatus('pending_verification'), 'чек ожидает проверки');
  assert.equal(formatReceiptVerificationStatus('verified'), 'чек подтвержден');
  assert.equal(formatReceiptVerificationStatus('failed'), 'чек не прошел проверку');
  assert.equal(formatReceiptVerificationStatus('skipped'), 'чек не приложен');

  assert.equal(formatReceiptSkipReason('qr_unreadable'), 'нечитаемый QR');
  assert.equal(formatReceiptSkipReason('receipt_lost'), 'чек потерян');
  assert.equal(formatReceiptSkipReason('cash_register_without_qr'), 'касса без QR');
  assert.equal(formatReceiptSkipReason('technical_error'), 'техническая ошибка');
  assert.equal(formatReceiptSkipReason('other'), 'другое');
});
