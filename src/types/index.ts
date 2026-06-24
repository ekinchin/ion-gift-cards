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

export type CardOwnerTransferType = 'INITIAL_LINK' | 'OWNER_TRANSFER';

export interface CardOwnerTransfer {
  id: string;
  card_id: string;
  from_customer_id: string | null;
  to_customer_id: string;
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
