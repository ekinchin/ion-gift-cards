import { db } from '../db/knex.ts';
import type { Knex } from 'knex';
import type {
  ReceiptSkipReason,
  ReceiptVerificationStatus,
  TransactionReceipt,
} from '../types/index.ts';

export interface CreateTransactionReceiptData {
  transactionId: string;
  rawQrPayload?: string;
  receiptUrl?: string;
  fiscalFn?: string;
  fiscalFd?: string;
  fiscalFp?: string;
  fiscalOperationType?: string;
  fiscalFingerprint?: string;
  receiptIssuedAt?: Date;
  receiptTotal?: number;
  receiptInn?: string;
  verificationStatus: ReceiptVerificationStatus;
  verificationError?: string;
  skipReason?: ReceiptSkipReason;
  skipComment?: string;
  createdByOperatorId?: string;
  verifiedAt?: Date;
}

function client(trx?: Knex.Transaction) {
  return trx ?? db;
}

export class TransactionReceiptRepository {
  async create(data: CreateTransactionReceiptData, trx?: Knex.Transaction): Promise<TransactionReceipt> {
    const [receipt] = await client(trx)('transaction_receipts')
      .insert({
        transaction_id: data.transactionId,
        raw_qr_payload: data.rawQrPayload || null,
        receipt_url: data.receiptUrl || null,
        fiscal_fn: data.fiscalFn || null,
        fiscal_fd: data.fiscalFd || null,
        fiscal_fp: data.fiscalFp || null,
        fiscal_operation_type: data.fiscalOperationType || null,
        fiscal_fingerprint: data.fiscalFingerprint || null,
        receipt_issued_at: data.receiptIssuedAt || null,
        receipt_total: data.receiptTotal ?? null,
        receipt_inn: data.receiptInn || null,
        verification_status: data.verificationStatus,
        verification_error: data.verificationError || null,
        skip_reason: data.skipReason || null,
        skip_comment: data.skipComment || null,
        created_by_operator_id: data.createdByOperatorId || null,
        verified_at: data.verifiedAt || null,
      })
      .returning('*');
    return receipt;
  }

  async findByTransactionIds(transactionIds: string[], trx?: Knex.Transaction): Promise<TransactionReceipt[]> {
    if (transactionIds.length === 0) {
      return [];
    }

    return client(trx)('transaction_receipts')
      .whereIn('transaction_id', transactionIds)
      .orderBy('created_at', 'asc');
  }

  async findByFingerprint(fiscalFingerprint: string, trx?: Knex.Transaction): Promise<TransactionReceipt | null> {
    const receipt = await client(trx)('transaction_receipts')
      .where({ fiscal_fingerprint: fiscalFingerprint })
      .first();
    return receipt || null;
  }

  async deleteByTransactionIds(transactionIds: string[], trx?: Knex.Transaction): Promise<void> {
    if (transactionIds.length === 0) {
      return;
    }

    await client(trx)('transaction_receipts')
      .whereIn('transaction_id', transactionIds)
      .delete();
  }
}
