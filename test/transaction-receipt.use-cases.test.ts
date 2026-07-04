import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReceiptConfig } from '../src/configuration/configuration-service.ts';
import type { Transaction, TransactionReceipt } from '../src/types/index.ts';
import { TransactionReceiptUseCases } from '../src/application/transaction-receipt.use-cases.ts';
import { AppError } from '../src/application/errors.ts';

const receiptConfig: ReceiptConfig = {
  mode: 'soft',
  allowedInns: ['1234567890'],
  maxAgeMinutes: 60,
  onlineVerification: 'disabled',
  provider: 'none',
};

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    card_id: 'card-1',
    type: 'DEBIT',
    amount: 500,
    balance_after: 500,
    description: null,
    operator_id: 'operator-1',
    created_at: new Date('2026-06-29T12:00:00.000Z'),
    ...overrides,
  };
}

function makeUseCases(transactions: Transaction[] = [makeTransaction()]) {
  const savedReceipts: TransactionReceipt[] = [];
  const txById = new Map(transactions.map((tx) => [tx.id, tx]));

  const txRepo = {
    async findById(id: string) {
      return txById.get(id) ?? null;
    },
  };

  const receiptRepo = {
    async create(data: Record<string, unknown>) {
      const receipt = {
        id: `receipt-${savedReceipts.length + 1}`,
        transaction_id: data.transactionId,
        raw_qr_payload: data.rawQrPayload ?? null,
        receipt_url: data.receiptUrl ?? null,
        fiscal_fn: data.fiscalFn ?? null,
        fiscal_fd: data.fiscalFd ?? null,
        fiscal_fp: data.fiscalFp ?? null,
        fiscal_operation_type: data.fiscalOperationType ?? null,
        fiscal_fingerprint: data.fiscalFingerprint ?? null,
        receipt_issued_at: data.receiptIssuedAt ?? null,
        receipt_total: data.receiptTotal ?? null,
        receipt_inn: data.receiptInn ?? null,
        verification_status: data.verificationStatus,
        verification_error: data.verificationError ?? null,
        skip_reason: data.skipReason ?? null,
        skip_comment: data.skipComment ?? null,
        created_by_operator_id: data.createdByOperatorId ?? null,
        created_at: new Date('2026-06-29T12:30:00.000Z'),
        verified_at: data.verifiedAt ?? null,
      } as TransactionReceipt;
      savedReceipts.push(receipt);
      return receipt;
    },
    async findByFingerprint(fiscalFingerprint: string) {
      return savedReceipts.find((receipt) => receipt.fiscal_fingerprint === fiscalFingerprint) ?? null;
    },
  };

  return {
    useCases: new TransactionReceiptUseCases(
      txRepo,
      receiptRepo,
      receiptConfig,
      () => new Date('2026-06-29T12:30:00.000Z')
    ),
    savedReceipts,
  };
}

test('attachReceipt saves a pending receipt for a debit transaction', async () => {
  const { useCases } = makeUseCases();

  const receipt = await useCases.attachReceipt({
    transactionId: 'tx-1',
    rawQrPayload: 't=20260629T1200&s=100.00&fn=123&fd=456&fp=789&n=1&inn=1234567890',
    operatorId: 'operator-1',
  });

  assert.equal(receipt.transaction_id, 'tx-1');
  assert.equal(receipt.verification_status, 'pending_verification');
  assert.equal(receipt.receipt_url, 'https://check.ofd.ru/rec/123/456/789');
  assert.equal(receipt.fiscal_fingerprint, '123:456:789');
});

test('attachReceipt saves failed receipt for wrong credit or create totals', async () => {
  for (const type of ['CREATE', 'CREDIT'] as const) {
    const { useCases } = makeUseCases([makeTransaction({ id: `tx-${type}`, type, amount: 500 })]);

    const receipt = await useCases.attachReceipt({
      transactionId: `tx-${type}`,
      rawQrPayload: 't=20260629T1200&s=100.00&fn=123&fd=456&fp=789&n=1&inn=1234567890',
      operatorId: 'operator-1',
    });

    assert.equal(receipt.verification_status, 'failed');
    assert.match(receipt.verification_error!, /must match transaction amount/);
  }
});

test('attachReceipt rejects duplicate fiscal receipts', async () => {
  const { useCases } = makeUseCases([
    makeTransaction({ id: 'tx-1' }),
    makeTransaction({ id: 'tx-2' }),
  ]);
  const rawQrPayload = 't=20260629T1200&s=100.00&fn=123&fd=456&fp=789&n=1&inn=1234567890';

  await useCases.attachReceipt({ transactionId: 'tx-1', rawQrPayload, operatorId: 'operator-1' });

  await assert.rejects(
    () => useCases.attachReceipt({ transactionId: 'tx-2', rawQrPayload, operatorId: 'operator-1' }),
    (error) => error instanceof AppError
      && error.code === 'RECEIPT_ALREADY_ATTACHED'
      && error.statusCode === 409
  );
});

test('attachReceipt rejects invalid fiscal receipt QR with application error', async () => {
  const { useCases } = makeUseCases();

  await assert.rejects(
    () => useCases.attachReceipt({
      transactionId: 'tx-1',
      rawQrPayload: 'ION-CARD-CODE',
      operatorId: 'operator-1',
    }),
    (error) => error instanceof AppError
      && error.code === 'INVALID_RECEIPT_QR'
      && error.statusCode === 400
  );
});

test('skipReceipt saves fixed skip reason and comment', async () => {
  const { useCases } = makeUseCases();

  const receipt = await useCases.skipReceipt({
    transactionId: 'tx-1',
    reason: 'other',
    comment: 'cashier note',
    operatorId: 'operator-1',
  });

  assert.equal(receipt.verification_status, 'skipped');
  assert.equal(receipt.skip_reason, 'other');
  assert.equal(receipt.skip_comment, 'cashier note');
});

test('skipReceipt rejects other without comment with application error', async () => {
  const { useCases } = makeUseCases();

  await assert.rejects(
    () => useCases.skipReceipt({
      transactionId: 'tx-1',
      reason: 'other',
      operatorId: 'operator-1',
    }),
    (error) => error instanceof AppError
      && error.code === 'RECEIPT_SKIP_COMMENT_REQUIRED'
      && error.statusCode === 400
  );
});

test('skipReceipt rejects unsupported skip reason with application error', async () => {
  const { useCases } = makeUseCases();

  await assert.rejects(
    () => useCases.skipReceipt({
      transactionId: 'tx-1',
      reason: 'unsupported' as never,
      operatorId: 'operator-1',
    }),
    (error) => error instanceof AppError
      && error.code === 'RECEIPT_SKIP_REASON_INVALID'
      && error.statusCode === 400
  );
});
