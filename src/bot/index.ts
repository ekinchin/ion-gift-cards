import { Bot, session } from 'grammy';
import type { TelegramConfig } from '../configuration/configuration-service.ts';
import { type MyContext, type SessionData } from './context.ts';
import { botCommands } from './handlers/commands.ts';
import { registerBotHandlers } from './handlers/index.ts';

export type { MyContext, SessionData } from './context.ts';

export function createBot(telegramConfig: TelegramConfig) {
  const bot = new Bot<MyContext>(telegramConfig.botToken);
  bot.use(session({ initial: (): SessionData => ({}) }));
  registerBotHandlers(bot, telegramConfig);
  return bot;
}

export async function configureBotApi(bot: Bot<MyContext>) {
  await bot.api.setMyCommands(botCommands);
  await bot.api.setChatMenuButton({ menu_button: { type: 'default' } });
}
