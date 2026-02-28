import { CardRepository } from '../repositories/CardRepository.ts';
import { TransactionRepository } from '../repositories/TransactionRepository.ts';
import { OperatorRepository } from '../repositories/OperatorRepository.ts';
import { CardService } from './CardService.ts';

// Repositories
export const cardRepository = new CardRepository();
export const transactionRepository = new TransactionRepository();
export const operatorRepository = new OperatorRepository();

// Services
export const cardService = new CardService(cardRepository, transactionRepository);
