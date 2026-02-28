import { db } from '../db/knex.ts';
import type { Transaction, TransactionType } from '../types/index.ts';

export interface CreateTransactionData {
  cardId: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  description?: string;
  operatorId?: string;
}

export class TransactionRepository {
  async create(data: CreateTransactionData): Promise<Transaction> {
    const [tx] = await db('transactions')
      .insert({
        card_id: data.cardId,
        type: data.type,
        amount: data.amount,
        balance_after: data.balanceAfter,
        description: data.description || null,
        operator_id: data.operatorId || null,
      })
      .returning('*');
    return tx;
  }

  async findByCardId(cardId: string): Promise<Transaction[]> {
    return db('transactions')
      .where({ card_id: cardId })
      .orderBy('created_at', 'desc');
  }

  async findById(id: string): Promise<Transaction | null> {
    const tx = await db('transactions').where({ id }).first();
    return tx || null;
  }
}
