import type { FastifyInstance } from 'fastify';
import { cardService } from '../services/index.ts';

export async function registerRoutes(app: FastifyInstance) {
  // Проверка баланса (для гостей)
  app.get('/api/cards/:code/balance', async (request, reply) => {
    const { code } = request.params as { code: string };
    try {
      const { balance } = await cardService.getBalance(code);
      return { code, balance };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(404).send({ error: message });
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(400).send({ error: message });
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(400).send({ error: message });
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  // История транзакций
  app.get('/api/cards/:code/history', async (request, reply) => {
    const { code } = request.params as { code: string };
    try {
      const history = await cardService.getHistory(code);
      return { code, transactions: history };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(404).send({ error: message });
    }
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}
