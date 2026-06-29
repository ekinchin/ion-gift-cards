import type { ReceiptConfig } from '../configuration/configuration-service.ts';
import type { TransactionRepository } from '../repositories/transaction.repository.ts';
import type { TransactionReceiptRepository } from '../repositories/transaction-receipt.repository.ts';
import type {
  ReceiptSkipReason,
  TransactionReceipt,
} from '../types/index.ts';
import {
  buildFiscalFingerprint,
  buildReceiptUrl,
  parseFiscalReceiptQr,
} from './receipt-qr.ts';
import {
  validateReceiptForTransaction,
  validateReceiptSkip,
} from './receipt-verification.ts';
import { CardNotFoundError } from './errors.ts';

export interface AttachReceiptInput {
  transactionId: string;
  rawQrPayload: string;
  operatorId: string;
}

export interface SkipReceiptInput {
  transactionId: string;
  reason: ReceiptSkipReason;
  comment?: string;
  operatorId: string;
}

type NowFactory = () => Date;

export class TransactionReceiptUseCases {
  #txRepo: Pick<TransactionRepository, 'findById'>;
  #receiptRepo: Pick<TransactionReceiptRepository, 'create' | 'findByFingerprint'>;
  #config: ReceiptConfig;
  #now: NowFactory;

  constructor(
    txRepo: Pick<TransactionRepository, 'findById'>,
    receiptRepo: Pick<TransactionReceiptRepository, 'create' | 'findByFingerprint'>,
    config: ReceiptConfig,
    now: NowFactory = () => new Date()
  ) {
    this.#txRepo = txRepo;
    this.#receiptRepo = receiptRepo;
    this.#config = config;
    this.#now = now;
  }

  async attachReceipt(input: AttachReceiptInput): Promise<TransactionReceipt> {
    const tx = await this.#txRepo.findById(input.transactionId);
    if (!tx) {
      throw new CardNotFoundError();
    }

    const parsed = parseFiscalReceiptQr(input.rawQrPayload);
    const fiscalFingerprint = buildFiscalFingerprint(parsed);
    const existing = await this.#receiptRepo.findByFingerprint(fiscalFingerprint);
    if (existing) {
      throw new Error('Receipt is already attached to another transaction');
    }

    const verification = validateReceiptForTransaction({
      transactionType: tx.type,
      transactionAmount: Number(tx.amount),
      receipt: parsed,
      config: this.#config,
      now: this.#now(),
      duplicateReceipt: false,
    });

    return this.#receiptRepo.create({
      transactionId: tx.id,
      rawQrPayload: input.rawQrPayload,
      receiptUrl: buildReceiptUrl(parsed),
      fiscalFn: parsed.fiscalFn,
      fiscalFd: parsed.fiscalFd,
      fiscalFp: parsed.fiscalFp,
      fiscalOperationType: parsed.operationType,
      fiscalFingerprint,
      receiptIssuedAt: parsed.issuedAt,
      receiptTotal: parsed.total,
      receiptInn: parsed.inn,
      verificationStatus: verification.status,
      verificationError: verification.error,
      createdByOperatorId: input.operatorId,
    });
  }

  async skipReceipt(input: SkipReceiptInput): Promise<TransactionReceipt> {
    const tx = await this.#txRepo.findById(input.transactionId);
    if (!tx) {
      throw new CardNotFoundError();
    }

    const verification = validateReceiptSkip({
      reason: input.reason,
      comment: input.comment,
    });
    if (verification.status === 'failed') {
      throw new Error(verification.error);
    }

    return this.#receiptRepo.create({
      transactionId: tx.id,
      verificationStatus: verification.status,
      skipReason: input.reason,
      skipComment: input.comment,
      createdByOperatorId: input.operatorId,
    });
  }
}
