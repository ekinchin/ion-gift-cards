import { db } from '../db/knex.ts';
import type { Operator } from '../types/index.ts';

export class OperatorRepository {
  async findByTelegramUserIdHash(telegramUserIdHash: string): Promise<Operator | null> {
    const operator = await db('operators')
      .where({ telegram_user_id_hmac: telegramUserIdHash, is_active: true })
      .first();
    return operator || null;
  }

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

  async create(telegramId: number, telegramUserIdHash: string, name: string): Promise<Operator> {
    const [operator] = await db('operators')
      .insert({
        telegram_id: telegramId,
        telegram_user_id_hmac: telegramUserIdHash,
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
