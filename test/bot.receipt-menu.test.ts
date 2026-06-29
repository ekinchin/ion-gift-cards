import test from 'node:test';
import assert from 'node:assert/strict';
import { Bot, session } from 'grammy';
import type { MyContext, SessionData } from '../src/bot/context.ts';
import { registerMessageHandlers } from '../src/bot/handlers/messages.ts';
import { menuButtonLabels } from '../src/bot/menu.ts';
import { cardService, operatorRepository, transactionReceiptService } from '../src/services/index.ts';

const telegramConfig = { mode: 'polling' as const, botToken: 'token', webAppUrl: 'https://example.test/qr' };

function patchMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  return () => {
    target[key] = original;
  };
}

function createTestBot(initialSession: SessionData) {
  const bot = new Bot<MyContext>('test-token', {
    botInfo: {
      id: 42,
      is_bot: true,
      first_name: 'Test Bot',
      username: 'test_bot',
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
    },
  });
  const apiCalls: Array<{ method: string; payload: Record<string, unknown> }> = [];

  bot.api.config.use(async (_prev, method, payload) => {
    apiCalls.push({ method, payload: payload as Record<string, unknown> });
    return {
      ok: true,
      result: {
        message_id: apiCalls.length,
        date: 1782777600,
        chat: { id: 1001, type: 'private' },
        text: String((payload as Record<string, unknown>).text ?? ''),
      },
    };
  });
  bot.use(session({ initial: () => ({ ...initialSession }) }));
  registerMessageHandlers(bot, telegramConfig);

  return { bot, apiCalls };
}

function operatorMenuLabels(payload: Record<string, unknown>) {
  const replyMarkup = payload.reply_markup as { keyboard: Array<Array<{ text: string }>> };
  return replyMarkup.keyboard.flat().map((button) => button.text);
}

test('receipt web app completion restores the operator menu keyboard', async () => {
  const { bot, apiCalls } = createTestBot({
    pendingReceipt: { transactionId: 'tx-1', operationType: 'CREATE' },
  });
  const restoreOperator = patchMethod(operatorRepository, 'findByTelegramId', async () => ({
    id: 'operator-1',
    telegram_id: 1001,
    name: 'Operator',
    is_active: true,
    created_at: new Date('2026-06-30T00:00:00.000Z'),
  }));
  const restoreAttach = patchMethod(transactionReceiptService, 'attachReceipt', async () => ({
    id: 'receipt-1',
    transaction_id: 'tx-1',
    raw_qr_payload: 't=20260630T0000&s=100.00&fn=1&i=1&fp=1&n=1',
    fiscal_drive_number: '1',
    fiscal_document_number: '1',
    fiscal_sign: '1',
    total: 100,
    purchased_at: new Date('2026-06-30T00:00:00.000Z'),
    verification_status: 'verified',
    verification_error: null,
    external_receipt_url: null,
    skip_reason: null,
    operator_comment: null,
    created_by_operator_id: 'operator-1',
    created_at: new Date('2026-06-30T00:00:00.000Z'),
    updated_at: new Date('2026-06-30T00:00:00.000Z'),
  }));

  try {
    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 1782777600,
        chat: { id: 1001, type: 'private', first_name: 'Operator' },
        from: { id: 1001, is_bot: false, first_name: 'Operator' },
        web_app_data: {
          button_text: 'Сканировать QR чека',
          data: JSON.stringify({ action: 'receipt', code: 't=20260630T0000&s=100.00&fn=1&i=1&fp=1&n=1' }),
        },
      },
    });

    assert.equal(apiCalls.length, 1);
    assert.equal(apiCalls[0]!.method, 'sendMessage');
    assert.deepEqual(operatorMenuLabels(apiCalls[0]!.payload), [
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
  } finally {
    restoreAttach();
    restoreOperator();
  }
});

test('receipt skip completion restores the operator menu keyboard', async () => {
  const { bot, apiCalls } = createTestBot({
    pendingReceipt: { transactionId: 'tx-1', operationType: 'DEBIT' },
  });
  const restoreOperator = patchMethod(operatorRepository, 'findByTelegramId', async () => ({
    id: 'operator-1',
    telegram_id: 1001,
    name: 'Operator',
    is_active: true,
    created_at: new Date('2026-06-30T00:00:00.000Z'),
  }));
  const restoreSkip = patchMethod(transactionReceiptService, 'skipReceipt', async () => ({
    id: 'receipt-1',
    transaction_id: 'tx-1',
    raw_qr_payload: null,
    fiscal_drive_number: null,
    fiscal_document_number: null,
    fiscal_sign: null,
    total: null,
    purchased_at: null,
    verification_status: 'skipped',
    verification_error: null,
    external_receipt_url: null,
    skip_reason: 'technical_error',
    operator_comment: null,
    created_by_operator_id: 'operator-1',
    created_at: new Date('2026-06-30T00:00:00.000Z'),
    updated_at: new Date('2026-06-30T00:00:00.000Z'),
  }));

  try {
    await bot.handleUpdate({
      update_id: 2,
      message: {
        message_id: 1,
        date: 1782777600,
        chat: { id: 1001, type: 'private', first_name: 'Operator' },
        from: { id: 1001, is_bot: false, first_name: 'Operator' },
        text: 'техническая ошибка',
      },
    });

    assert.equal(apiCalls.length, 1);
    assert.equal(apiCalls[0]!.method, 'sendMessage');
    assert.deepEqual(operatorMenuLabels(apiCalls[0]!.payload), [
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
  } finally {
    restoreSkip();
    restoreOperator();
  }
});

test('manual card code after debit scan prompt debits the card', async () => {
  const { bot, apiCalls } = createTestBot({
    pendingCardOperation: { action: 'debit', amount: 100, description: 'coffee' },
  });
  const restoreOperator = patchMethod(operatorRepository, 'findByTelegramId', async () => ({
    id: 'operator-1',
    telegram_id: 1001,
    name: 'Operator',
    is_active: true,
    created_at: new Date('2026-06-30T00:00:00.000Z'),
  }));
  const debits: Array<{ code: string; amount: number; operatorId: string; description?: string }> = [];
  const restoreDebit = patchMethod(cardService, 'debit', async (code, amount, operatorId, description) => {
    debits.push({ code, amount, operatorId, description });
    return {
      card: {
        id: 'card-1',
        code,
        balance: 900,
        initial_amount: 1000,
        is_active: true,
        created_at: new Date('2026-06-30T00:00:00.000Z'),
      },
      transaction: {
        id: 'tx-debit',
        card_id: 'card-1',
        type: 'DEBIT',
        amount,
        balance_after: 900,
        description: description ?? null,
        operator_id: operatorId,
        created_at: new Date('2026-06-30T00:00:00.000Z'),
      },
    };
  });
  const restoreBalance = patchMethod(cardService, 'getBalance', async () => {
    throw new Error('manual debit code must not be handled as a balance lookup');
  });

  try {
    await bot.handleUpdate({
      update_id: 3,
      message: {
        message_id: 1,
        date: 1782777600,
        chat: { id: 1001, type: 'private', first_name: 'Operator' },
        from: { id: 1001, is_bot: false, first_name: 'Operator' },
        text: 'ION-559NRXWWB4MV',
      },
    });

    assert.deepEqual(debits, [{
      code: 'ION-559NRXWWB4MV',
      amount: 100,
      operatorId: 'operator-1',
      description: 'coffee',
    }]);
    assert.match(String(apiCalls[0]!.payload.text), /Списано: 100 ₽/);
    assert.match(String(apiCalls[0]!.payload.text), /Остаток: 900 ₽/);
  } finally {
    restoreBalance();
    restoreDebit();
    restoreOperator();
  }
});
