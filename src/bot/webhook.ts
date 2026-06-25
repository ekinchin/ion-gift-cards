import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import { webhookCallback, type Bot } from 'grammy';
import { configureBotApi, createBot, type MyContext } from './index.ts';
import { ConfigurationService } from '../configuration/configuration-service.ts';

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
  const configurationService = ConfigurationService.fromEnv();
  const telegramConfig = configurationService.getTelegramConfig();
  if (telegramConfig.mode !== 'webhook') {
    throw new Error('Telegram bot is configured for polling mode, but webhook entrypoint was started');
  }

  const bot = createBot(telegramConfig);
  const app = createWebhookApp(bot, telegramConfig.webhookSecret);

  await configureBotApi(bot, telegramConfig);

  const apiConfig = configurationService.getApiConfig();
  await app.listen({ port: apiConfig.port, host: apiConfig.host });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startWebhookServer();
}
