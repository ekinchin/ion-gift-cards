import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { AppError } from '../application/errors.ts';
import { cardService } from '../services/index.ts';
import { qrMiniAppHtml } from './qr-mini-app.html.ts';
import {
  type CardCodeParams,
  cardCodeParamsSchema,
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
  app.get('/qr', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(qrMiniAppHtml);
  });

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
