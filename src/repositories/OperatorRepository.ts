import { db } from '../db/knex.ts';
import type { Operator } from '../types/index.ts';

export class OperatorRepository {
  async findByTelegramId(telegramId: number): Promise<Operator | null> {
    const operator = await db('operators')
      .where({ telegram_id: telegramId, is_active: true })
      .first();
    return operator || null;
  }

  async findById(id: string): Promise<Operator | null> {
    const operator = await db('operators').where({ id }).first();
    return operator || null;
  }

  async create(telegramId: number, name: string): Promise<Operator> {
    const [operator] = await db('operators')
      .insert({
        telegram_id: telegramId,
        name,
      })
      .returning('*');
    return operator;
  }

  async deactivate(id: string): Promise<void> {
    await db('operators').where({ id }).update({ is_active: false });
  }

  async getAll(): Promise<Operator[]> {
    return db('operators').where({ is_active: true });
  }
}
