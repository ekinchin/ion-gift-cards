export interface Card {
  id: string;
  code: string;
  balance: number;
  initial_amount: number;
  is_active: boolean;
  created_at: Date;
}

export interface Transaction {
  id: string;
  card_id: string;
  type: TransactionType;
  amount: number;
  balance_after: number;
  description: string | null;
  operator_id: string | null;
  created_at: Date;
}

export type ReceiptVerificationStatus = 'verified' | 'pending_verification' | 'failed' | 'skipped';
export type ReceiptSkipReason = 'qr_unreadable' | 'receipt_lost' | 'cash_register_without_qr' | 'technical_error' | 'other';

export interface TransactionReceipt {
  id: string;
  transaction_id: string;
  raw_qr_payload: string | null;
  receipt_url: string | null;
  fiscal_fn: string | null;
  fiscal_fd: string | null;
  fiscal_fp: string | null;
  fiscal_operation_type: string | null;
  fiscal_fingerprint: string | null;
  receipt_issued_at: Date | null;
  receipt_total: number | null;
  receipt_inn: string | null;
  verification_status: ReceiptVerificationStatus;
  verification_error: string | null;
  skip_reason: ReceiptSkipReason | null;
  skip_comment: string | null;
  created_by_operator_id: string | null;
  created_at: Date;
  verified_at: Date | null;
}

export interface TransactionReceiptSummary {
  status: ReceiptVerificationStatus;
  receiptUrl?: string;
  verificationError?: string;
}

export type TransactionWithReceipt = Transaction & {
  receipt?: TransactionReceiptSummary;
};

export interface Customer {
  id: string;
  created_at: Date;
}

export type IdentityProvider = 'telegram';

export interface CustomerIdentity {
  id: string;
  customer_id: string;
  provider: IdentityProvider;
  provider_user_id: string;
  username: string | null;
  display_name: string | null;
  created_at: Date;
}

export interface CardOwner {
  card_id: string;
  customer_id: string;
  linked_at: Date;
}

export interface CardTransferToken {
  id: string;
  token: string;
  card_id: string;
  from_customer_id: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export type CardOwnerTransferType = 'INITIAL_LINK' | 'OWNER_TRANSFER' | 'OWNER_UNLINK';

export interface CardOwnerTransfer {
  id: string;
  card_id: string;
  from_customer_id: string | null;
  to_customer_id: string | null;
  initiated_by_customer_id: string | null;
  type: CardOwnerTransferType;
  created_at: Date;
}

export interface Operator {
  id: string;
  telegram_id: number;
  name: string;
  is_active: boolean;
  created_at: Date;
}

export type TransactionType = 'CREATE' | 'DEBIT' | 'CREDIT';
