import { operatorRepository } from '../../services/index.ts';
import { hashTelegramUserIdForBot } from '../telegram-identity.ts';

export async function getOperator(telegramId: number) {
  return operatorRepository.findByTelegramUserIdHash(hashTelegramUserIdForBot(telegramId));
}
