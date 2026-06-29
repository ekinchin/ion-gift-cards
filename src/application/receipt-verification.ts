import type { ReceiptConfig } from '../configuration/configuration-service.ts';
import type {
  ReceiptSkipReason,
  ReceiptVerificationStatus,
  TransactionType,
} from '../types/index.ts';
import type { ParsedFiscalReceiptQr } from './receipt-qr.ts';

const skipReasons = new Set<ReceiptSkipReason>([
  'qr_unreadable',
  'receipt_lost',
  'cash_register_without_qr',
  'technical_error',
  'other',
]);

export interface ReceiptVerificationResult {
  status: ReceiptVerificationStatus;
  error?: string;
}

export interface ValidateReceiptForTransactionInput {
  transactionType: TransactionType;
  transactionAmount: number;
  receipt: ParsedFiscalReceiptQr;
  config: ReceiptConfig;
  now: Date;
  duplicateReceipt: boolean;
}

export interface ValidateReceiptSkipInput {
  reason: ReceiptSkipReason;
  comment?: string;
}

function fail(error: string): ReceiptVerificationResult {
  return { status: 'failed', error };
}

function amountsEqual(left: number, right: number) {
  return Math.round(left * 100) === Math.round(right * 100);
}

export function validateReceiptForTransaction(input: ValidateReceiptForTransactionInput): ReceiptVerificationResult {
  if (input.duplicateReceipt) {
    return fail('Receipt is already attached to another transaction');
  }

  const ageMinutes = (input.now.getTime() - input.receipt.issuedAt.getTime()) / 60_000;
  if (ageMinutes > input.config.maxAgeMinutes) {
    return fail(`Receipt is older than ${input.config.maxAgeMinutes} minutes`);
  }

  if (input.config.allowedInns.length > 0 && input.receipt.inn && !input.config.allowedInns.includes(input.receipt.inn)) {
    return fail('Receipt INN is not allowed');
  }

  if ((input.transactionType === 'CREATE' || input.transactionType === 'CREDIT')
    && !amountsEqual(input.transactionAmount, input.receipt.total)) {
    return fail('Receipt total must match transaction amount');
  }

  return { status: 'pending_verification', error: undefined };
}

export function validateReceiptSkip(input: ValidateReceiptSkipInput): ReceiptVerificationResult {
  if (!skipReasons.has(input.reason)) {
    return fail('Unsupported receipt skip reason');
  }

  if (input.reason === 'other' && (!input.comment || input.comment.trim().length === 0)) {
    return fail('Receipt skip reason other requires a comment');
  }

  return { status: 'skipped', error: undefined };
}
