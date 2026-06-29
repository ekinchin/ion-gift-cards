import type { Context, SessionFlavor } from 'grammy';
import type { PendingMenuAction } from './pending-menu-action.ts';
import type { TransactionType } from '../types/index.ts';

export interface PendingReceiptAttachment {
  transactionId: string;
  operationType: TransactionType;
}

export interface SessionData {
  action?: PendingMenuAction;
  cardCode?: string;
  pendingReceipt?: PendingReceiptAttachment;
}

export type MyContext = Context & SessionFlavor<SessionData>;
