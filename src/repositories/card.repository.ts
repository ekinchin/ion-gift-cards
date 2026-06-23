import { db } from '../db/knex.ts';
import type { Knex } from 'knex';
import type { Card } from '../types/index.ts';

function client(trx?: Knex.Transaction) {
  return trx ?? db;
}

export class CardRepository {
  async findByCode(code: string, trx?: Knex.Transaction): Promise<Card | null> {
    const card = await client(trx)('cards')
      .where({ code, is_active: true })
      .first();
    return card || null;
  }

  async findByCodeForUpdate(code: string, trx: Knex.Transaction): Promise<Card | null> {
    const card = await trx('cards')
      .where({ code, is_active: true })
      .forUpdate()
      .first();

    return card || null;
  }

  async findById(id: string, trx?: Knex.Transaction): Promise<Card | null> {
    const card = await client(trx)('cards').where({ id }).first();
    return card || null;
  }

  async create(code: string, initialAmount: number, trx?: Knex.Transaction): Promise<Card> {
    const [card] = await client(trx)('cards')
      .insert({
        code,
        balance: initialAmount,
        initial_amount: initialAmount,
      })
      .returning('*');
    return card;
  }

  async updateBalance(id: string, newBalance: number, trx?: Knex.Transaction): Promise<void> {
    await client(trx)('cards').where({ id }).update({ balance: newBalance });
  }

  async deactivate(id: string, trx?: Knex.Transaction): Promise<void> {
    await client(trx)('cards').where({ id }).update({ is_active: false });
  }
}
