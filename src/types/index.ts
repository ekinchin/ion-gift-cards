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

export interface Operator {
  id: string;
  telegram_id: number;
  name: string;
  is_active: boolean;
  created_at: Date;
}

export type TransactionType = 'CREATE' | 'DEBIT' | 'CREDIT';
