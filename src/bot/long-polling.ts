import { configureBotApi, createBot } from './index.ts';
import { ConfigurationService } from '../configuration/configuration-service.ts';
import { pathToFileURL } from 'node:url';

export type LongPollingBot = {
  start(): Promise<void> | void;
};

export async function startLongPolling(bot: LongPollingBot) {
  await bot.start();
}

async function main() {
  const telegramConfig = ConfigurationService.fromEnv().getTelegramConfig();
  if (telegramConfig.mode !== 'polling') {
    throw new Error('Telegram bot is configured for webhook mode, but long polling entrypoint was started');
  }

  const bot = createBot(telegramConfig);

  await configureBotApi(bot);
  console.log('Bot long polling starting');
  await startLongPolling(bot);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
