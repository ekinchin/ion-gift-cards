import type { FastifyInstance } from 'fastify';
import { cardService } from '../../services/index.ts';
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
}
