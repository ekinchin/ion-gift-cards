import type { Bot } from 'grammy';
import type { TelegramConfig } from '../../configuration/configuration-service.ts';
import type { MyContext } from '../context.ts';
import { registerCommandHandlers } from './commands.ts';
import { registerMessageHandlers } from './messages.ts';
import { configureTelegramIdentity } from '../telegram-identity.ts';

export function registerBotHandlers(bot: Bot<MyContext>, telegramConfig: TelegramConfig) {
  configureTelegramIdentity(telegramConfig.identityHmacSecret);
  registerCommandHandlers(bot, telegramConfig);
  registerMessageHandlers(bot, telegramConfig);
}
