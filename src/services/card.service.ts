import { CardRepository } from '../repositories/card.repository.ts';
import { TransactionRepository } from '../repositories/transaction.repository.ts';
import type { Card, Transaction } from '../types/index.ts';

export class CardService {
  #cardRepo: CardRepository;
  #txRepo: TransactionRepository;

  constructor(
    cardRepo: CardRepository,
    txRepo: TransactionRepository
  ) {
    this.#cardRepo = cardRepo;
    this.#txRepo = txRepo;
  }

  async createCard(code: string, initialAmount: number, operatorId?: string): Promise<Card> {
    const existing = await this.#cardRepo.findByCode(code);
    if (existing) {
      throw new Error('Card with this code already exists');
    }

    const card = await this.#cardRepo.create(code, initialAmount);

    await this.#txRepo.create({
      cardId: card.id,
      type: 'CREATE',
      amount: initialAmount,
      balanceAfter: initialAmount,
      description: 'Card created',
      operatorId,
    });

    return card;
  }

  async getBalance(code: string): Promise<{ card: Card; balance: number }> {
    const card = await this.#cardRepo.findByCode(code);
    if (!card) {
      throw new Error('Card not found');
    }
    return { card, balance: Number(card.balance) };
  }

  async debit(code: string, amount: number, operatorId: string, description?: string): Promise<Card> {
    const card = await this.#cardRepo.findByCode(code);
    if (!card) {
      throw new Error('Card not found');
    }

    const currentBalance = Number(card.balance);
    if (currentBalance < amount) {
      throw new Error(`Insufficient balance. Current: ${currentBalance}, Required: ${amount}`);
    }

    const newBalance = currentBalance - amount;
    await this.#cardRepo.updateBalance(card.id, newBalance);

    await this.#txRepo.create({
      cardId: card.id,
      type: 'DEBIT',
      amount,
      balanceAfter: newBalance,
      description: description || 'Purchase',
      operatorId,
    });

    return { ...card, balance: newBalance };
  }

  async credit(code: string, amount: number, operatorId: string, description?: string): Promise<Card> {
    const card = await this.#cardRepo.findByCode(code);
    if (!card) {
      throw new Error('Card not found');
    }

    const currentBalance = Number(card.balance);
    const newBalance = currentBalance + amount;
    await this.#cardRepo.updateBalance(card.id, newBalance);

    await this.#txRepo.create({
      cardId: card.id,
      type: 'CREDIT',
      amount,
      balanceAfter: newBalance,
      description: description || 'Deposit',
      operatorId,
    });

    return { ...card, balance: newBalance };
  }

  async getHistory(code: string): Promise<Transaction[]> {
    const card = await this.#cardRepo.findByCode(code);
    if (!card) {
      throw new Error('Card not found');
    }
    return this.#txRepo.findByCardId(card.id);
  }
}
