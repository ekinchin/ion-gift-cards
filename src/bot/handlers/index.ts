import type { Bot } from 'grammy';
import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import type { MyContext } from '../context.ts';
import { registerCommandHandlers } from './commands.ts';
import { registerMessageHandlers } from './messages.ts';

export function registerBotHandlers(bot: Bot<MyContext>, telegramConfig: TelegramConfig) {
  registerCommandHandlers(bot, telegramConfig);
  registerMessageHandlers(bot, telegramConfig);
}
