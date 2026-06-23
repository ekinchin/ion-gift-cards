import type { FastifyInstance, FastifyReply } from 'fastify';
import { AppError } from '../application/errors.ts';
import { cardService } from '../services/index.ts';

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
  app.get('/api/cards/:code/balance', async (request, reply) => {
    const { code } = request.params as { code: string };
    try {
      const { balance } = await cardService.getBalance(code);
      return { code, balance };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Создать карту (для операторов)
  app.post('/api/cards', async (request, reply) => {
    const { code, amount, operatorId } = request.body as {
      code: string;
      amount: number;
      operatorId?: string;
    };
    try {
      const card = await cardService.createCard(code, amount, operatorId);
      return reply.status(201).send(card);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Списание (для операторов)
  app.post('/api/cards/:code/debit', async (request, reply) => {
    const { code } = request.params as { code: string };
    const { amount, operatorId, description } = request.body as {
      amount: number;
      operatorId: string;
      description?: string;
    };
    try {
      const card = await cardService.debit(code, amount, operatorId, description);
      return { code, balance: card.balance };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Пополнение (для операторов)
  app.post('/api/cards/:code/credit', async (request, reply) => {
    const { code } = request.params as { code: string };
    const { amount, operatorId, description } = request.body as {
      amount: number;
      operatorId: string;
      description?: string;
    };
    try {
      const card = await cardService.credit(code, amount, operatorId, description);
      return { code, balance: card.balance };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // История транзакций
  app.get('/api/cards/:code/history', async (request, reply) => {
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
