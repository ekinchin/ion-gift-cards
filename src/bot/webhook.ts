import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import { webhookCallback, type Bot } from 'grammy';
import { configureBotApi, createBot, type MyContext } from './index.ts';

export function createWebhookApp(bot: Bot<MyContext>, secret: string, logger = true) {
  const app = Fastify({ logger });
  const callback = webhookCallback(bot, 'fastify');

  app.post('/webhook', async (request, reply) => {
    if (request.headers['x-telegram-bot-api-secret-token'] !== secret) {
      reply.code(401);
      return { ok: false };
    }

    return callback(request, reply);
  });

  app.get('/health', async () => ({ ok: true }));

  return app;
}

export async function startWebhookServer() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET is required');
  }

  const bot = createBot();
  const app = createWebhookApp(bot, secret);

  await configureBotApi(bot);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startWebhookServer();
}
