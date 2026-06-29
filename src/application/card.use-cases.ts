import { CardRepository } from '../repositories/card.repository.ts';
import { TransactionRepository } from '../repositories/transaction.repository.ts';
import type { Knex } from 'knex';
import type { Card, Transaction } from '../types/index.ts';
import { db } from '../db/knex.ts';
import { generateCardCode } from './card-code.generator.ts';
import {
  CardNotFoundError,
  DuplicateCardError,
  InsufficientBalanceError,
  InvalidAmountError,
} from './errors.ts';

const MAX_CARD_CODE_GENERATION_ATTEMPTS = 5;
type TransactionRunner = <T>(callback: (trx: Knex.Transaction) => Promise<T>) => Promise<T>;
export interface CardMutationResult {
  card: Card;
  transaction: Transaction;
}

export class CardUseCases {
  #cardRepo: CardRepository;
  #txRepo: TransactionRepository;
  #codeFactory: () => string;
  #transaction: TransactionRunner;

  constructor(
    cardRepo: CardRepository,
    txRepo: TransactionRepository,
    codeFactory: () => string = generateCardCode,
    transaction: TransactionRunner = db.transaction.bind(db)
  ) {
    this.#cardRepo = cardRepo;
    this.#txRepo = txRepo;
    this.#codeFactory = codeFactory;
    this.#transaction = transaction;
  }

  async createCard(initialAmount: number, operatorId?: string): Promise<CardMutationResult> {
    this.#assertPositiveAmount(initialAmount);

    return this.#transaction(async (trx) => {
      const code = await this.#generateUniqueCode(trx);

      const card = await this.#cardRepo.create(code, initialAmount, trx);

      const transaction = await this.#txRepo.create({
        cardId: card.id,
        type: 'CREATE',
        amount: initialAmount,
        balanceAfter: initialAmount,
        description: 'Card created',
        operatorId,
      }, trx);

      return { card, transaction };
    });
  }

  async #generateUniqueCode(trx: Knex.Transaction): Promise<string> {
    for (let attempt = 0; attempt < MAX_CARD_CODE_GENERATION_ATTEMPTS; attempt += 1) {
      const code = this.#codeFactory();
      const existing = await this.#cardRepo.findByCode(code, trx);
      if (!existing) {
        return code;
      }
    }

    throw new DuplicateCardError();
  }

  async getBalance(code: string): Promise<{ card: Card; balance: number }> {
    const card = await this.#cardRepo.findByCode(code);
    if (!card) {
      throw new CardNotFoundError();
    }
    return { card, balance: Number(card.balance) };
  }

  async debit(code: string, amount: number, operatorId: string, description?: string): Promise<CardMutationResult> {
    this.#assertPositiveAmount(amount);

    return this.#transaction(async (trx) => {
      const card = await this.#cardRepo.findByCodeForUpdate(code, trx);
      if (!card) {
        throw new CardNotFoundError();
      }

      const currentBalance = Number(card.balance);
      if (currentBalance < amount) {
        throw new InsufficientBalanceError(currentBalance, amount);
      }

      const newBalance = currentBalance - amount;
      await this.#cardRepo.updateBalance(card.id, newBalance, trx);

      const transaction = await this.#txRepo.create({
        cardId: card.id,
        type: 'DEBIT',
        amount,
        balanceAfter: newBalance,
        description: description || 'Purchase',
        operatorId,
      }, trx);

      return { card: { ...card, balance: newBalance }, transaction };
    });
  }

  async credit(code: string, amount: number, operatorId: string, description?: string): Promise<CardMutationResult> {
    this.#assertPositiveAmount(amount);

    return this.#transaction(async (trx) => {
      const card = await this.#cardRepo.findByCodeForUpdate(code, trx);
      if (!card) {
        throw new CardNotFoundError();
      }

      const currentBalance = Number(card.balance);
      const newBalance = currentBalance + amount;
      await this.#cardRepo.updateBalance(card.id, newBalance, trx);

      const transaction = await this.#txRepo.create({
        cardId: card.id,
        type: 'CREDIT',
        amount,
        balanceAfter: newBalance,
        description: description || 'Deposit',
        operatorId,
      }, trx);

      return { card: { ...card, balance: newBalance }, transaction };
    });
  }

  #assertPositiveAmount(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new InvalidAmountError();
    }
  }

  async getHistory(code: string): Promise<Transaction[]> {
    const card = await this.#cardRepo.findByCode(code);
    if (!card) {
      throw new CardNotFoundError();
    }
    return this.#txRepo.findByCardId(card.id);
  }
}
