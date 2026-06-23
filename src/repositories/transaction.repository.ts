import { db } from '../db/knex.ts';
import type { Knex } from 'knex';
import type { Transaction, TransactionType } from '../types/index.ts';

export interface CreateTransactionData {
  cardId: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  description?: string;
  operatorId?: string;
}

function client(trx?: Knex.Transaction) {
  return trx ?? db;
}

export class TransactionRepository {
  async create(data: CreateTransactionData, trx?: Knex.Transaction): Promise<Transaction> {
    const [tx] = await client(trx)('transactions')
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

  async findByCardId(cardId: string, trx?: Knex.Transaction): Promise<Transaction[]> {
    return client(trx)('transactions')
      .where({ card_id: cardId })
      .orderBy('created_at', 'desc');
  }

  async findById(id: string, trx?: Knex.Transaction): Promise<Transaction | null> {
    const tx = await client(trx)('transactions').where({ id }).first();
    return tx || null;
  }
}
