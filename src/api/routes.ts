import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { AppError } from '../application/errors.ts';
import { cardService } from '../services/index.ts';
import { requireOperator } from './auth.ts';
import {
  type CardCodeParams,
  type CreateCardBody,
  type MutateCardBody,
  cardCodeParamsSchema,
  createCardBodySchema,
  mutateCardBodySchema,
} from './schemas.ts';

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
    });
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' });
}

function sendValidationError(reply: FastifyReply, error: ZodError) {
  return reply.status(400).send({
    error: 'Invalid request',
    code: 'VALIDATION_ERROR',
    issues: error.issues,
  });
}

export async function registerRoutes(app: FastifyInstance) {
  // Проверка баланса (для гостей)
  app.get<{ Params: CardCodeParams }>('/api/cards/:code/balance', async (request, reply) => {
    const params = cardCodeParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendValidationError(reply, params.error);
    }

    const { code } = params.data;
    try {
      const { balance } = await cardService.getBalance(code);
      return { code, balance };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Создать карту (для операторов)
  app.post<{ Body: CreateCardBody }>('/api/cards', async (request, reply) => {
    const operator = await requireOperator(request);
    if (!operator) {
      return reply.status(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const body = createCardBodySchema.safeParse(request.body);
    if (!body.success) {
      return sendValidationError(reply, body.error);
    }

    const { code, amount } = body.data;
    try {
      const card = await cardService.createCard(code, amount, operator.id);
      return reply.status(201).send(card);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Списание (для операторов)
  app.post<{ Params: CardCodeParams; Body: MutateCardBody }>('/api/cards/:code/debit', async (request, reply) => {
    const operator = await requireOperator(request);
    if (!operator) {
      return reply.status(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const params = cardCodeParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendValidationError(reply, params.error);
    }

    const body = mutateCardBodySchema.safeParse(request.body);
    if (!body.success) {
      return sendValidationError(reply, body.error);
    }

    const { code } = params.data;
    const { amount, description } = body.data;
    try {
      const card = await cardService.debit(code, amount, operator.id, description);
      return { code, balance: card.balance };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Пополнение (для операторов)
  app.post<{ Params: CardCodeParams; Body: MutateCardBody }>('/api/cards/:code/credit', async (request, reply) => {
    const operator = await requireOperator(request);
    if (!operator) {
      return reply.status(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const params = cardCodeParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendValidationError(reply, params.error);
    }

    const body = mutateCardBodySchema.safeParse(request.body);
    if (!body.success) {
      return sendValidationError(reply, body.error);
    }

    const { code } = params.data;
    const { amount, description } = body.data;
    try {
      const card = await cardService.credit(code, amount, operator.id, description);
      return { code, balance: card.balance };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // История транзакций
  app.get<{ Params: CardCodeParams }>('/api/cards/:code/history', async (request, reply) => {
    const params = cardCodeParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendValidationError(reply, params.error);
    }

    const { code } = params.data;
    try {
      const history = await cardService.getHistory(code);
      return { code, transactions: history };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}
