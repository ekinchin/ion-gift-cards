import type { Context, SessionFlavor } from 'grammy';
import type { PendingMenuAction } from './pending-menu-action.ts';
import type { TransactionType } from '../types/index.ts';

export interface PendingReceiptAttachment {
  transactionId: string;
  operationType: TransactionType;
  cardCode?: string;
  amount?: number;
  balanceAfter?: number;
}

export interface PendingCardOperation {
  action: 'debit' | 'credit';
  amount: number;
  description?: string;
}

export type PendingConsentAction =
  | { action: 'createPersonalCard' }
  | { action: 'linkCard'; code?: string }
  | { action: 'acceptTransfer'; token: string };

export interface SessionData {
  action?: PendingMenuAction;
  cardCode?: string;
  pendingCardOperation?: PendingCardOperation;
  pendingConsentAction?: PendingConsentAction;
  pendingUnlinkConfirmation?: { code?: string };
  pendingReceipt?: PendingReceiptAttachment;
}

export type MyContext = Context & SessionFlavor<SessionData>;
