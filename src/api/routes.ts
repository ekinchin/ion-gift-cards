import type { FastifyInstance, FastifyReply } from 'fastify';
import { AppError } from '../application/errors.ts';
import { cardService } from '../services/index.ts';
import { requireOperator } from './auth.ts';
import {
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

export async function registerRoutes(app: FastifyInstance) {
  // Проверка баланса (для гостей)
  app.get('/api/cards/:code/balance', {
    schema: {
      params: cardCodeParamsSchema,
    },
  }, async (request, reply) => {
    const { code } = request.params as { code: string };
    try {
      const { balance } = await cardService.getBalance(code);
      return { code, balance };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Создать карту (для операторов)
  app.post('/api/cards', {
    schema: {
      body: createCardBodySchema,
    },
  }, async (request, reply) => {
    const operator = await requireOperator(request);
    if (!operator) {
      return reply.status(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const { code, amount } = request.body as {
      code: string;
      amount: number;
    };
    try {
      const card = await cardService.createCard(code, amount, operator.id);
      return reply.status(201).send(card);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Списание (для операторов)
  app.post('/api/cards/:code/debit', {
    schema: {
      params: cardCodeParamsSchema,
      body: mutateCardBodySchema,
    },
  }, async (request, reply) => {
    const operator = await requireOperator(request);
    if (!operator) {
      return reply.status(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const { code } = request.params as { code: string };
    const { amount, description } = request.body as {
      amount: number;
      description?: string;
    };
    try {
      const card = await cardService.debit(code, amount, operator.id, description);
      return { code, balance: card.balance };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Пополнение (для операторов)
  app.post('/api/cards/:code/credit', {
    schema: {
      params: cardCodeParamsSchema,
      body: mutateCardBodySchema,
    },
  }, async (request, reply) => {
    const operator = await requireOperator(request);
    if (!operator) {
      return reply.status(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const { code } = request.params as { code: string };
    const { amount, description } = request.body as {
      amount: number;
      description?: string;
    };
    try {
      const card = await cardService.credit(code, amount, operator.id, description);
      return { code, balance: card.balance };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // История транзакций
  app.get('/api/cards/:code/history', {
    schema: {
      params: cardCodeParamsSchema,
    },
  }, async (request, reply) => {
    const { code } = request.params as { code: string };
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
