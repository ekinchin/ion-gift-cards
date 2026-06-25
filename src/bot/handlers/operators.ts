import { operatorRepository } from '../../services/index.ts';

export async function getOperator(telegramId: number) {
  return operatorRepository.findByTelegramId(telegramId);
}
