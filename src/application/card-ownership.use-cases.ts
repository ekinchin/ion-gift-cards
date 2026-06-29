import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { db } from '../db/knex.ts';
import type { Card, IdentityProvider, Transaction, TransactionReceipt, TransactionWithReceipt } from '../types/index.ts';
import { generateCardCode } from './card-code.generator.ts';
import { assertCanReadCardHistory, type Actor } from './card-access-policy.ts';
import {
  CardAlreadyLinkedError,
  CardAlreadyLinkedToCustomerError,
  CardNotFoundError,
  CardOwnershipRequiredError,
  CustomerAlreadyHasCardError,
  DuplicateCardError,
  MultipleOwnedCardsError,
  NoOwnedCardsError,
  TransferToSameCustomerError,
  TransferTokenExpiredError,
  TransferTokenInvalidError,
  TransferTokenUsedError,
} from './errors.ts';

interface CardReader {
  findByCode(code: string, trx?: Knex.Transaction): Promise<Card | null>;
  findById(id: string, trx?: Knex.Transaction): Promise<Card | null>;
  create(code: string, initialAmount: number, trx?: Knex.Transaction): Promise<Card>;
}

interface TransactionReader {
  findByCardId(cardId: string, trx?: Knex.Transaction): Promise<Transaction[]>;
}

interface TransactionReceiptReader {
  findByTransactionIds(transactionIds: string[], trx?: Knex.Transaction): Promise<TransactionReceipt[]>;
}

interface CustomerIdentityResolver {
  resolveOrCreateIdentity(
    data: {
      provider: IdentityProvider;
      providerUserId: string;
      username?: string;
      displayName?: string;
    },
    trx?: Knex.Transaction
  ): Promise<{ customer: { id: string }; identity: unknown }>;
}

interface OwnershipStore {
  findOwnerByCardId(cardId: string, trx?: Knex.Transaction): Promise<{ card_id: string; customer_id: string } | null>;
  findOwnerByCardIdForUpdate(cardId: string, trx: Knex.Transaction): Promise<{ card_id: string; customer_id: string } | null>;
  findCardsByCustomerId(customerId: string, trx?: Knex.Transaction): Promise<Card[]>;
  linkCard(cardId: string, customerId: string, trx?: Knex.Transaction): Promise<unknown>;
  updateOwner(cardId: string, customerId: string, trx?: Knex.Transaction): Promise<unknown>;
  unlinkCard(cardId: string, trx?: Knex.Transaction): Promise<unknown>;
  createTransferToken(
    token: string,
    cardId: string,
    fromCustomerId: string,
    expiresAt: Date,
    trx?: Knex.Transaction
  ): Promise<unknown>;
  findTransferTokenForUpdate(
    token: string,
    trx: Knex.Transaction
  ): Promise<{
    id: string;
    card_id: string;
    from_customer_id: string;
    expires_at: Date;
    used_at: Date | null;
  } | null>;
  markTransferTokenUsed(id: string, trx?: Knex.Transaction): Promise<void>;
  createTransferEvent(
    data: {
      cardId: string;
      fromCustomerId: string | null;
      toCustomerId: string | null;
      initiatedByCustomerId: string | null;
      type: 'INITIAL_LINK' | 'OWNER_TRANSFER' | 'OWNER_UNLINK';
    },
    trx?: Knex.Transaction
  ): Promise<unknown>;
}

type TransactionRunner = <T>(callback: (trx: Knex.Transaction) => Promise<T>) => Promise<T>;
const MAX_CARD_CODE_GENERATION_ATTEMPTS = 5;

export interface ProviderIdentityInput {
  provider: IdentityProvider;
  providerUserId: string;
  username?: string;
  displayName?: string;
}

export class CardOwnershipUseCases {
  #cardRepo: CardReader;
  #txRepo: TransactionReader;
  #customerRepo: CustomerIdentityResolver;
  #ownershipRepo: OwnershipStore;
  #receiptRepo?: TransactionReceiptReader;
  #transaction: TransactionRunner;
  #now: () => Date;
  #tokenFactory: () => string;
  #cardCodeFactory: () => string;

  constructor(
    cardRepo: CardReader,
    txRepo: TransactionReader,
    customerRepo: CustomerIdentityResolver,
    ownershipRepo: OwnershipStore,
    transaction: TransactionRunner = (callback) => db.transaction(callback),
    now: () => Date = () => new Date(),
    tokenFactory: () => string = () => randomUUID(),
    cardCodeFactory: () => string = generateCardCode,
    receiptRepo?: TransactionReceiptReader
  ) {
    this.#cardRepo = cardRepo;
    this.#txRepo = txRepo;
    this.#customerRepo = customerRepo;
    this.#ownershipRepo = ownershipRepo;
    this.#transaction = transaction;
    this.#now = now;
    this.#tokenFactory = tokenFactory;
    this.#cardCodeFactory = cardCodeFactory;
    this.#receiptRepo = receiptRepo;
  }

  async resolveCustomer(input: ProviderIdentityInput) {
    return this.#customerRepo.resolveOrCreateIdentity(input);
  }

  async linkCard(customerId: string, code: string): Promise<Card> {
    return this.#transaction(async (trx) => {
      const card = await this.#cardRepo.findByCode(code, trx);
      if (!card) {
        throw new CardNotFoundError();
      }

      const owner = await this.#ownershipRepo.findOwnerByCardIdForUpdate(card.id, trx);
      if (owner?.customer_id === customerId) {
        throw new CardAlreadyLinkedToCustomerError();
      }
      if (owner) {
        throw new CardAlreadyLinkedError();
      }

      await this.#assertCustomerHasNoCard(customerId, trx);
      await this.#ownershipRepo.linkCard(card.id, customerId, trx);
      await this.#ownershipRepo.createTransferEvent({
        cardId: card.id,
        fromCustomerId: null,
        toCustomerId: customerId,
        initiatedByCustomerId: customerId,
        type: 'INITIAL_LINK',
      }, trx);

      return card;
    });
  }

  async listCards(customerId: string): Promise<Card[]> {
    return this.#ownershipRepo.findCardsByCustomerId(customerId);
  }

  async createPersonalCard(customerId: string): Promise<{ card: Card; created: boolean }> {
    return this.#transaction(async (trx) => {
      const existingCards = await this.#ownershipRepo.findCardsByCustomerId(customerId, trx);
      if (existingCards.length > 0) {
        return { card: existingCards[0]!, created: false };
      }

      const code = await this.#generateUniqueCode(trx);
      const card = await this.#cardRepo.create(code, 0, trx);
      await this.#ownershipRepo.linkCard(card.id, customerId, trx);
      await this.#ownershipRepo.createTransferEvent({
        cardId: card.id,
        fromCustomerId: null,
        toCustomerId: customerId,
        initiatedByCustomerId: customerId,
        type: 'INITIAL_LINK',
      }, trx);

      return { card, created: true };
    });
  }

  async unlinkCard(customerId: string, code: string): Promise<Card> {
    return this.#unlinkOwnedCard(customerId, code, customerId);
  }

  async unlinkCurrentCard(customerId: string): Promise<Card> {
    const card = await this.#resolveOwnedCard(customerId);
    return this.#unlinkOwnedCard(customerId, card.code, customerId);
  }

  async getOwnedBalance(customerId: string, code?: string): Promise<{ card: Card; balance: number }> {
    const card = await this.#resolveOwnedCard(customerId, code);
    return { card, balance: Number(card.balance) };
  }

  async getOwnedHistory(customerId: string, code?: string): Promise<{ card: Card; transactions: TransactionWithReceipt[] }> {
    const card = await this.#resolveOwnedCard(customerId, code);
    const transactions = await this.#txRepo.findByCardId(card.id);
    return { card, transactions: await this.#withReceiptSummaries(transactions) };
  }

  async getHistoryByCode(
    code: string,
    actor: Actor = {}
  ): Promise<{ card: Card; transactions: TransactionWithReceipt[] }> {
    const card = await this.#cardRepo.findByCode(code);
    if (!card) {
      throw new CardNotFoundError();
    }

    const owner = await this.#ownershipRepo.findOwnerByCardId(card.id);
    assertCanReadCardHistory(actor, owner);

    const transactions = await this.#txRepo.findByCardId(card.id);
    return { card, transactions: await this.#withReceiptSummaries(transactions) };
  }

  async #withReceiptSummaries(transactions: Transaction[]): Promise<TransactionWithReceipt[]> {
    if (!this.#receiptRepo || transactions.length === 0) {
      return transactions;
    }

    const receipts = await this.#receiptRepo.findByTransactionIds(transactions.map((tx) => tx.id));
    const receiptByTransactionId = new Map(receipts.map((receipt) => [receipt.transaction_id, receipt]));

    return transactions.map((tx) => {
      if (tx.type === 'CREATE') {
        return tx;
      }

      const receipt = receiptByTransactionId.get(tx.id);
      if (!receipt) {
        return tx;
      }

      return {
        ...tx,
        receipt: {
          status: receipt.verification_status,
          receiptUrl: receipt.receipt_url || undefined,
        },
      };
    });
  }

  async startTransfer(
    customerId: string,
    code: string,
    ttlMinutes = 15
  ): Promise<{ card: Card; token: string; expiresAt: Date }> {
    return this.#transaction(async (trx) => {
      const card = await this.#cardRepo.findByCode(code, trx);
      if (!card) {
        throw new CardNotFoundError();
      }

      const owner = await this.#ownershipRepo.findOwnerByCardIdForUpdate(card.id, trx);
      if (owner?.customer_id !== customerId) {
        throw new CardOwnershipRequiredError();
      }

      const token = this.#tokenFactory();
      const expiresAt = new Date(this.#now().getTime() + ttlMinutes * 60 * 1000);
      await this.#ownershipRepo.createTransferToken(token, card.id, customerId, expiresAt, trx);

      return { card, token, expiresAt };
    });
  }

  async acceptTransfer(customerId: string, token: string): Promise<Card> {
    return this.#transaction(async (trx) => {
      const transferToken = await this.#ownershipRepo.findTransferTokenForUpdate(token, trx);
      if (!transferToken) {
        throw new TransferTokenInvalidError();
      }
      if (transferToken.used_at) {
        throw new TransferTokenUsedError();
      }
      if (transferToken.expires_at.getTime() <= this.#now().getTime()) {
        throw new TransferTokenExpiredError();
      }
      if (transferToken.from_customer_id === customerId) {
        throw new TransferToSameCustomerError();
      }

      await this.#assertCustomerHasNoCard(customerId, trx);

      const owner = await this.#ownershipRepo.findOwnerByCardIdForUpdate(transferToken.card_id, trx);
      if (owner?.customer_id !== transferToken.from_customer_id) {
        throw new CardOwnershipRequiredError();
      }

      const card = await this.#cardRepo.findById(transferToken.card_id, trx);
      if (!card || !card.is_active) {
        throw new CardNotFoundError();
      }

      await this.#ownershipRepo.updateOwner(card.id, customerId, trx);
      await this.#ownershipRepo.markTransferTokenUsed(transferToken.id, trx);
      await this.#ownershipRepo.createTransferEvent({
        cardId: card.id,
        fromCustomerId: transferToken.from_customer_id,
        toCustomerId: customerId,
        initiatedByCustomerId: transferToken.from_customer_id,
        type: 'OWNER_TRANSFER',
      }, trx);

      return card;
    });
  }

  async #unlinkOwnedCard(customerId: string, code: string, initiatedByCustomerId: string): Promise<Card> {
    return this.#transaction(async (trx) => {
      const card = await this.#cardRepo.findByCode(code, trx);
      if (!card) {
        throw new CardNotFoundError();
      }

      const owner = await this.#ownershipRepo.findOwnerByCardIdForUpdate(card.id, trx);
      if (owner?.customer_id !== customerId) {
        throw new CardOwnershipRequiredError();
      }

      await this.#ownershipRepo.unlinkCard(card.id, trx);
      await this.#ownershipRepo.createTransferEvent({
        cardId: card.id,
        fromCustomerId: customerId,
        toCustomerId: null,
        initiatedByCustomerId,
        type: 'OWNER_UNLINK',
      }, trx);

      return card;
    });
  }

  async #resolveOwnedCard(customerId: string, code?: string): Promise<Card> {
    if (code) {
      const card = await this.#cardRepo.findByCode(code);
      if (!card) {
        throw new CardNotFoundError();
      }
      const owner = await this.#ownershipRepo.findOwnerByCardId(card.id);
      if (owner?.customer_id !== customerId) {
        throw new CardOwnershipRequiredError();
      }
      return card;
    }

    const cards = await this.#ownershipRepo.findCardsByCustomerId(customerId);
    if (cards.length === 0) {
      throw new NoOwnedCardsError();
    }
    if (cards.length > 1) {
      throw new MultipleOwnedCardsError();
    }
    return cards[0]!;
  }

  async #assertCustomerHasNoCard(customerId: string, trx: Knex.Transaction) {
    const cards = await this.#ownershipRepo.findCardsByCustomerId(customerId, trx);
    if (cards.length > 0) {
      throw new CustomerAlreadyHasCardError();
    }
  }

  async #generateUniqueCode(trx: Knex.Transaction): Promise<string> {
    for (let attempt = 0; attempt < MAX_CARD_CODE_GENERATION_ATTEMPTS; attempt += 1) {
      const code = this.#cardCodeFactory();
      const existing = await this.#cardRepo.findByCode(code, trx);
      if (!existing) {
        return code;
      }
    }

    throw new DuplicateCardError();
  }
}
