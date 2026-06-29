import test from 'node:test';
import assert from 'node:assert/strict';
import { CardRepository } from '../src/repositories/card.repository.ts';
import { TransactionRepository } from '../src/repositories/transaction.repository.ts';
import { TransactionReceiptRepository } from '../src/repositories/transaction-receipt.repository.ts';
import { closeDatabase, resetDatabase } from './helpers/db.ts';

const runDbTests = process.env.RUN_DB_TESTS === '1';

test.beforeEach({ skip: !runDbTests }, async () => {
  await resetDatabase();
});

test.after({ skip: !runDbTests }, async () => {
  await closeDatabase();
});

async function createTransaction() {
  const cardRepository = new CardRepository();
  const transactionRepository = new TransactionRepository();
  const card = await cardRepository.create(`CARD-${crypto.randomUUID()}`, 1000);
  return transactionRepository.create({
    cardId: card.id,
    type: 'DEBIT',
    amount: 250,
    balanceAfter: 750,
    operatorId: undefined,
  });
}

test('transaction receipt repository creates and finds receipts by transaction ids', { skip: !runDbTests }, async () => {
  const receiptRepository = new TransactionReceiptRepository();
  const tx = await createTransaction();

  const receipt = await receiptRepository.create({
    transactionId: tx.id,
    rawQrPayload: 't=20260629T1200&s=250.00&fn=123&fd=456&fp=789&n=1',
    receiptUrl: 'https://receipt.example/?fn=123&fd=456&fp=789',
    fiscalFn: '123',
    fiscalFd: '456',
    fiscalFp: '789',
    fiscalOperationType: '1',
    fiscalFingerprint: '123:456:789',
    receiptIssuedAt: new Date('2026-06-29T12:00:00.000Z'),
    receiptTotal: 250,
    receiptInn: '1234567890',
    verificationStatus: 'pending_verification',
    createdByOperatorId: undefined,
  });

  const receipts = await receiptRepository.findByTransactionIds([tx.id]);

  assert.equal(receipt.transaction_id, tx.id);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0]?.fiscal_fingerprint, '123:456:789');
});

test('transaction receipt repository enforces one receipt per transaction', { skip: !runDbTests }, async () => {
  const receiptRepository = new TransactionReceiptRepository();
  const tx = await createTransaction();

  await receiptRepository.create({
    transactionId: tx.id,
    verificationStatus: 'skipped',
    skipReason: 'qr_unreadable',
  });

  await assert.rejects(
    () => receiptRepository.create({
      transactionId: tx.id,
      verificationStatus: 'skipped',
      skipReason: 'receipt_lost',
    }),
    /duplicate key|unique constraint|UNIQUE/i
  );
});

test('transaction receipt repository enforces unique fiscal fingerprint', { skip: !runDbTests }, async () => {
  const receiptRepository = new TransactionReceiptRepository();
  const firstTx = await createTransaction();
  const secondTx = await createTransaction();

  await receiptRepository.create({
    transactionId: firstTx.id,
    fiscalFingerprint: '123:456:789',
    verificationStatus: 'pending_verification',
  });

  await assert.rejects(
    () => receiptRepository.create({
      transactionId: secondTx.id,
      fiscalFingerprint: '123:456:789',
      verificationStatus: 'pending_verification',
    }),
    /duplicate key|unique constraint|UNIQUE/i
  );
});
