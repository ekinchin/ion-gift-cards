import { CardRepository } from '../repositories/card.repository.ts';
import { TransactionRepository } from '../repositories/transaction.repository.ts';
import { OperatorRepository } from '../repositories/operator.repository.ts';
import { CustomerRepository } from '../repositories/customer.repository.ts';
import { CardOwnershipRepository } from '../repositories/card-ownership.repository.ts';
import { CardUseCases } from '../application/card.use-cases.ts';
import { CardOwnershipUseCases } from '../application/card-ownership.use-cases.ts';

// Repositories
export const cardRepository = new CardRepository();
export const transactionRepository = new TransactionRepository();
export const operatorRepository = new OperatorRepository();
export const customerRepository = new CustomerRepository();
export const cardOwnershipRepository = new CardOwnershipRepository();

// Services
export const cardService = new CardUseCases(cardRepository, transactionRepository);
export const cardOwnershipService = new CardOwnershipUseCases(
  cardRepository,
  transactionRepository,
  customerRepository,
  cardOwnershipRepository
);
