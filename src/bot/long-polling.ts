import { configureBotApi, createBot } from './index.ts';
import { ConfigurationService } from '../configuration/configuration-service.ts';

const telegramConfig = ConfigurationService.fromEnv().getTelegramConfig();
if (telegramConfig.mode !== 'polling') {
  throw new Error('Telegram bot is configured for webhook mode, but long polling entrypoint was started');
}

const bot = createBot(telegramConfig);

await configureBotApi(bot, telegramConfig);
bot.start();

console.log('Bot long polling started');
