import Fastify from 'fastify';
import { registerRoutes } from './api/routes.ts';

const app = Fastify({ logger: true });

const PORT = Number(process.env.API_PORT) || 3000;
const HOST = process.env.API_HOST || '0.0.0.0';

await registerRoutes(app);

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`🚀 Server running at http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
