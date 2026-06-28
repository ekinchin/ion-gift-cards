import type { FastifyInstance } from 'fastify';
import { cardOwnershipService, cardService } from '../../services/index.ts';
import { resolveApiActor } from '../auth.ts';
import {
  type CardCodeParams,
  cardCodeParamsSchema,
} from '../schemas.ts';
import { sendError, sendValidationError } from './errors.ts';

export function registerCardRoutes(app: FastifyInstance) {
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

  app.get<{ Params: CardCodeParams }>('/api/cards/:code/history', async (request, reply) => {
    const params = cardCodeParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendValidationError(reply, params.error);
    }

    const { code } = params.data;
    try {
      const actor = await resolveApiActor(request);
      const { transactions: history } = await cardOwnershipService.getHistoryByCode(code, actor);
      return { code, transactions: history };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
