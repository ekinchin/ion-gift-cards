import type { FastifyInstance } from 'fastify';
import { qrMiniAppHtml } from '../qr-mini-app.html.ts';

export function registerQrRoutes(app: FastifyInstance) {
  app.get('/qr', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(qrMiniAppHtml);
  });
}
