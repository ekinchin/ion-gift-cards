import { db } from '../db/knex.ts';
import type { Card } from '../types/index.ts';

export class CardRepository {
  async findByCode(code: string): Promise<Card | null> {
    const card = await db('cards')
      .where({ code, is_active: true })
      .first();
    return card || null;
  }

  async findById(id: string): Promise<Card | null> {
    const card = await db('cards').where({ id }).first();
    return card || null;
  }

  async create(code: string, initialAmount: number): Promise<Card> {
    const [card] = await db('cards')
      .insert({
        code,
        balance: initialAmount,
        initial_amount: initialAmount,
      })
      .returning('*');
    return card;
  }

  async updateBalance(id: string, newBalance: number): Promise<void> {
    await db('cards').where({ id }).update({ balance: newBalance });
  }

  async deactivate(id: string): Promise<void> {
    await db('cards').where({ id }).update({ is_active: false });
  }
}
