import { db } from '../../src/db/knex.ts';

export async function resetDatabase() {
  await db('transaction_receipts').delete();
  await db('transactions').delete();
  await db('card_owner_transfers').delete();
  await db('card_transfer_tokens').delete();
  await db('card_owners').delete();
  await db('cards').delete();
  await db('customer_identities').delete();
  await db('customers').delete();
  await db('operators').delete();
}

export async function closeDatabase() {
  await db.destroy();
}
