import { CardRepository } from '../repositories/card.repository.ts';
import { TransactionRepository } from '../repositories/transaction.repository.ts';
import { OperatorRepository } from '../repositories/operator.repository.ts';
import { CardService } from './card.service.ts';

// Repositories
export const cardRepository = new CardRepository();
export const transactionRepository = new TransactionRepository();
export const operatorRepository = new OperatorRepository();

// Services
export const cardService = new CardService(cardRepository, transactionRepository);
