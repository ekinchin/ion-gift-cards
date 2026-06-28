import type { FastifyRequest } from 'fastify';
import type { Actor } from '../application/card-access-policy.ts';
import { cardOwnershipService, operatorRepository } from '../services/index.ts';

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

export async function requireCustomer(request: FastifyRequest) {
  const telegramIdHeader = request.headers['x-customer-telegram-id'];
  const rawTelegramId = Array.isArray(telegramIdHeader)
    ? telegramIdHeader[0]
    : telegramIdHeader;
  const telegramId = Number(rawTelegramId);

  if (!Number.isFinite(telegramId)) {
    return null;
  }

  const { customer } = await cardOwnershipService.resolveCustomer({
    provider: 'telegram',
    providerUserId: String(telegramId),
  });
  return customer;
}

export async function resolveApiActor(request: FastifyRequest): Promise<Actor> {
  const [operator, customer] = await Promise.all([
    requireOperator(request),
    requireCustomer(request),
  ]);

  return {
    customerId: customer?.id,
    operatorId: operator?.id,
  };
}
