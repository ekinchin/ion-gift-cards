import type { FastifyInstance } from 'fastify';
import { registerCardRoutes } from './handlers/card-routes.ts';
import { registerHealthRoutes } from './handlers/health-routes.ts';
import { registerQrRoutes } from './handlers/qr-routes.ts';

export async function registerRoutes(app: FastifyInstance) {
  registerQrRoutes(app);
  registerCardRoutes(app);
  registerHealthRoutes(app);
}
