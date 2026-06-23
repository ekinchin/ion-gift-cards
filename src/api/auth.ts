import type { FastifyRequest } from 'fastify';
import { operatorRepository } from '../services/index.ts';

export async function requireOperator(request: FastifyRequest) {
  const telegramIdHeader = request.headers['x-operator-telegram-id'];
  const rawTelegramId = Array.isArray(telegramIdHeader)
    ? telegramIdHeader[0]
    : telegramIdHeader;
  const telegramId = Number(rawTelegramId);

  if (!Number.isFinite(telegramId)) {
    return null;
  }

  return operatorRepository.findByTelegramId(telegramId);
}
