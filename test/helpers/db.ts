import { db } from '../../src/db/knex.ts';

export async function resetDatabase() {
  await db('transactions').delete();
  await db('cards').delete();
  await db('operators').delete();
}

export async function closeDatabase() {
  await db.destroy();
}
