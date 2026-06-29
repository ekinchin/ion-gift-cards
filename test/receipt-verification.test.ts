import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReceiptConfig } from '../src/configuration/configuration-service.ts';
import { parseFiscalReceiptQr } from '../src/application/receipt-qr.ts';
import {
  validateReceiptForTransaction,
  validateReceiptSkip,
} from '../src/application/receipt-verification.ts';

const config: ReceiptConfig = {
  mode: 'soft',
  allowedInns: ['1234567890'],
  maxAgeMinutes: 60,
  onlineVerification: 'disabled',
  provider: 'none',
};

const now = new Date('2026-06-29T12:30:00.000Z');

function qr(payload = 't=20260629T1200&s=500.00&fn=123&fd=456&fp=789&n=1&inn=1234567890') {
  return parseFiscalReceiptQr(payload);
}

test('validateReceiptForTransaction returns pending verification for locally valid receipts', () => {
  const result = validateReceiptForTransaction({
    transactionType: 'DEBIT',
    transactionAmount: 900,
    receipt: qr(),
    config,
    now,
    duplicateReceipt: false,
  });

  assert.deepEqual(result, {
    status: 'pending_verification',
    error: undefined,
  });
});

test('validateReceiptForTransaction rejects stale receipts', () => {
  const result = validateReceiptForTransaction({
    transactionType: 'DEBIT',
    transactionAmount: 100,
    receipt: qr('t=20260629T1000&s=500.00&fn=123&fd=456&fp=789&n=1&inn=1234567890'),
    config,
    now,
    duplicateReceipt: false,
  });

  assert.equal(result.status, 'failed');
  assert.match(result.error!, /older than 60 minutes/);
});

test('validateReceiptForTransaction rejects disallowed INN', () => {
  const result = validateReceiptForTransaction({
    transactionType: 'DEBIT',
    transactionAmount: 100,
    receipt: qr('t=20260629T1200&s=500.00&fn=123&fd=456&fp=789&n=1&inn=0000000000'),
    config,
    now,
    duplicateReceipt: false,
  });

  assert.equal(result.status, 'failed');
  assert.match(result.error!, /not allowed/);
});

test('validateReceiptForTransaction rejects duplicate receipts', () => {
  const result = validateReceiptForTransaction({
    transactionType: 'DEBIT',
    transactionAmount: 100,
    receipt: qr(),
    config,
    now,
    duplicateReceipt: true,
  });

  assert.equal(result.status, 'failed');
  assert.match(result.error!, /already attached/);
});

test('validateReceiptForTransaction does not compare DEBIT amount to receipt total', () => {
  const result = validateReceiptForTransaction({
    transactionType: 'DEBIT',
    transactionAmount: 900,
    receipt: qr('t=20260629T1200&s=100.00&fn=123&fd=456&fp=789&n=1&inn=1234567890'),
    config,
    now,
    duplicateReceipt: false,
  });

  assert.equal(result.status, 'pending_verification');
});

test('validateReceiptForTransaction requires CREATE and CREDIT totals to match', () => {
  for (const transactionType of ['CREATE', 'CREDIT'] as const) {
    const result = validateReceiptForTransaction({
      transactionType,
      transactionAmount: 900,
      receipt: qr('t=20260629T1200&s=100.00&fn=123&fd=456&fp=789&n=1&inn=1234567890'),
      config,
      now,
      duplicateReceipt: false,
    });

    assert.equal(result.status, 'failed');
    assert.match(result.error!, /must match transaction amount/);
  }
});

test('validateReceiptSkip accepts fixed reasons and requires comment for other', () => {
  assert.deepEqual(validateReceiptSkip({ reason: 'qr_unreadable' }), {
    status: 'skipped',
    error: undefined,
  });

  assert.equal(validateReceiptSkip({ reason: 'other' }).status, 'failed');
  assert.deepEqual(validateReceiptSkip({ reason: 'other', comment: 'operator note' }), {
    status: 'skipped',
    error: undefined,
  });
});
