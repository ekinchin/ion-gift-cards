import test from 'node:test';
import assert from 'node:assert/strict';
import type { Card, TransactionWithReceipt } from '../src/types/index.ts';
import { cardOwnershipService } from '../src/services/index.ts';
import { replyOwnedHistory } from '../src/bot/handlers/card-replies.ts';

const now = new Date('2026-06-29T12:00:00.000Z');

function makeCard(): Card {
  return {
    id: 'card-1',
    code: 'ION-TESTCARD01',
    balance: 900,
    initial_amount: 1000,
    is_active: true,
    created_at: now,
  };
}

function makeContext() {
  const replies: Array<{ text: string }> = [];
  return {
    from: { id: 1001, first_name: 'Test', last_name: 'User', username: 'test_user' },
    session: {},
    replies,
    async reply(text: string) {
      replies.push({ text });
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

test('replyOwnedHistory shows receipt status and link without operator-only skip reason', async () => {
  const ctx = makeContext();
  const restoreResolve = patchMethod(cardOwnershipService, 'resolveCustomer', async () => ({
    customer: { id: 'customer-1' },
    identity: {},
  }));
  const restoreHistory = patchMethod(cardOwnershipService, 'getOwnedHistory', async () => ({
    card: makeCard(),
    transactions: [
      {
        id: 'tx-debit',
        card_id: 'card-1',
        type: 'DEBIT',
        amount: 100,
        balance_after: 900,
        description: null,
        operator_id: 'operator-1',
        created_at: now,
        receipt: {
          status: 'pending_verification',
          receiptUrl: 'https://example.test/debit',
        },
      },
      {
        id: 'tx-credit',
        card_id: 'card-1',
        type: 'CREDIT',
        amount: 200,
        balance_after: 1100,
        description: null,
        operator_id: 'operator-1',
        created_at: now,
        receipt: {
          status: 'skipped',
          receiptUrl: undefined,
        },
      },
      {
        id: 'tx-failed',
        card_id: 'card-1',
        type: 'DEBIT',
        amount: 50,
        balance_after: 1050,
        description: null,
        operator_id: 'operator-1',
        created_at: now,
        receipt: {
          status: 'failed',
          receiptUrl: 'https://example.test/failed',
          verificationError: 'Receipt is older than 60 minutes',
        },
      },
    ] satisfies TransactionWithReceipt[],
  }));

  try {
    await replyOwnedHistory(ctx as never);

    assert.match(ctx.replies[0]!.text, /➖ 100 ₽ → 900 ₽/);
    assert.match(ctx.replies[0]!.text, /➕ 200 ₽ → 1100 ₽/);
    assert.doesNotMatch(ctx.replies[0]!.text, /🔴|🟢/);
    assert.match(ctx.replies[0]!.text, /Чек приложен/);
    assert.match(ctx.replies[0]!.text, /https:\/\/example\.test\/debit/);
    assert.match(ctx.replies[0]!.text, /Чек не приложен/);
    assert.match(ctx.replies[0]!.text, /Чек не прошел проверку: чек старше 60 минут/);
    assert.doesNotMatch(ctx.replies[0]!.text, /29\.06\.2026|64\.99/);
    assert.doesNotMatch(ctx.replies[0]!.text, /technical_error|internal note/);
  } finally {
    restoreHistory();
    restoreResolve();
  }
});
