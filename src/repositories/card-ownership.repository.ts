import { db } from '../db/knex.ts';
import type { Knex } from 'knex';
import type {
  Card,
  CardOwner,
  CardOwnerTransfer,
  CardOwnerTransferType,
  CardTransferToken,
} from '../types/index.ts';

function client(trx?: Knex.Transaction) {
  return trx ?? db;
}

export class CardOwnershipRepository {
  async findOwnerByCardId(cardId: string, trx?: Knex.Transaction): Promise<CardOwner | null> {
    const owner = await client(trx)('card_owners').where({ card_id: cardId }).first<CardOwner>();
    return owner ?? null;
  }

  async findOwnerByCardIdForUpdate(cardId: string, trx: Knex.Transaction): Promise<CardOwner | null> {
    const owner = await trx('card_owners').where({ card_id: cardId }).forUpdate().first<CardOwner>();
    return owner ?? null;
  }

  async findCardsByCustomerId(customerId: string, trx?: Knex.Transaction): Promise<Card[]> {
    return client(trx)('cards')
      .join('card_owners', 'cards.id', 'card_owners.card_id')
      .where('card_owners.customer_id', customerId)
      .andWhere('cards.is_active', true)
      .select<Card[]>('cards.*')
      .orderBy('card_owners.linked_at', 'desc');
  }

  async linkCard(cardId: string, customerId: string, trx?: Knex.Transaction): Promise<CardOwner> {
    const [owner] = await client(trx)('card_owners')
      .insert({
        card_id: cardId,
        customer_id: customerId,
      })
      .returning<CardOwner[]>('*');
    return owner;
  }

  async updateOwner(cardId: string, customerId: string, trx?: Knex.Transaction): Promise<CardOwner> {
    const [owner] = await client(trx)('card_owners')
      .where({ card_id: cardId })
      .update({
        customer_id: customerId,
        linked_at: client(trx).fn.now(),
      })
      .returning<CardOwner[]>('*');
    return owner;
  }

  async createTransferToken(
    token: string,
    cardId: string,
    fromCustomerId: string,
    expiresAt: Date,
    trx?: Knex.Transaction
  ): Promise<CardTransferToken> {
    const [transferToken] = await client(trx)('card_transfer_tokens')
      .insert({
        token,
        card_id: cardId,
        from_customer_id: fromCustomerId,
        expires_at: expiresAt,
      })
      .returning<CardTransferToken[]>('*');
    return transferToken;
  }

  async findTransferToken(token: string, trx?: Knex.Transaction): Promise<CardTransferToken | null> {
    const transferToken = await client(trx)('card_transfer_tokens')
      .where({ token })
      .first<CardTransferToken>();
    return transferToken ?? null;
  }

  async findTransferTokenForUpdate(token: string, trx: Knex.Transaction): Promise<CardTransferToken | null> {
    const transferToken = await trx('card_transfer_tokens')
      .where({ token })
      .forUpdate()
      .first<CardTransferToken>();
    return transferToken ?? null;
  }

  async markTransferTokenUsed(id: string, trx?: Knex.Transaction): Promise<void> {
    await client(trx)('card_transfer_tokens')
      .where({ id })
      .update({ used_at: client(trx).fn.now() });
  }

  async createTransferEvent(
    data: {
      cardId: string;
      fromCustomerId: string | null;
      toCustomerId: string;
      initiatedByCustomerId: string | null;
      type: CardOwnerTransferType;
    },
    trx?: Knex.Transaction
  ): Promise<CardOwnerTransfer> {
    const [event] = await client(trx)('card_owner_transfers')
      .insert({
        card_id: data.cardId,
        from_customer_id: data.fromCustomerId,
        to_customer_id: data.toCustomerId,
        initiated_by_customer_id: data.initiatedByCustomerId,
        type: data.type,
      })
      .returning<CardOwnerTransfer[]>('*');
    return event;
  }
}
